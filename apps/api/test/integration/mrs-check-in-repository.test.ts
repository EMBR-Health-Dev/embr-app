import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The real upsert, the (user, date) unique key, the scoped delete and
// the 0 to 4 CHECK constraint, against the Postgres CI provides.
const { mrsRepository } = await import("../../src/modules/mrs/mrs.repository.js");
const { prisma } = await import("../../src/lib/prisma.js");

function isPostgresReachable(url: string | undefined, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "127.0.0.1";
    let port = 5432;
    try {
      const parsed = new URL(url ?? "");
      host = parsed.hostname || host;
      port = parsed.port ? Number(parsed.port) : port;
    } catch {
      resolve(false);
      return;
    }
    const socket = connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

const reachable = await isPostgresReachable(process.env.DATABASE_URL);
const userIds: string[] = [];

async function makeUser() {
  const user = await prisma.user.create({
    data: { email: `mrs-it-${randomUUID()}@embr.test`, passwordHash: "x" },
  });
  userIds.push(user.id);
  return user.id;
}

const ANSWERS = {
  hotFlushes: 3,
  heartDiscomfort: 1,
  sleepProblems: 4,
  depressiveMood: 2,
  irritability: 1,
  anxiety: 0,
  exhaustion: 3,
  sexualProblems: 1,
  bladderProblems: 0,
  vaginalDryness: 2,
  jointMuscular: 2,
};

describe.skipIf(!reachable)("mrsRepository against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("keeps one check-in per date and replaces it on a second save", async () => {
    const userId = await makeUser();
    await mrsRepository.save(userId, "2026-06-01", { locale: "en", answers: ANSWERS });
    await mrsRepository.save(userId, "2026-06-01", {
      locale: "en",
      answers: { ...ANSWERS, hotFlushes: 0 },
    });

    const rows = await mrsRepository.list(userId, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hotFlushes: 0,
      locale: "en",
      instrumentVersion: "MRS-EN-2003",
    });
  });

  it("filters by date range and orders oldest first", async () => {
    const userId = await makeUser();
    for (const date of ["2026-07-01", "2026-05-01", "2026-06-01"]) {
      await mrsRepository.save(userId, date, { locale: "en", answers: ANSWERS });
    }
    const rows = await mrsRepository.list(userId, { from: "2026-05-15", to: "2026-07-01" });
    expect(rows.map((r) => r.completedOn.toISOString().slice(0, 10))).toEqual([
      "2026-06-01",
      "2026-07-01",
    ]);
  });

  it("deletes only the owner's check-in", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    await mrsRepository.save(owner, "2026-06-01", { locale: "en", answers: ANSWERS });

    expect(await mrsRepository.delete(other, "2026-06-01")).toBe(false);
    expect(await mrsRepository.list(owner, {})).toHaveLength(1);
    expect(await mrsRepository.delete(owner, "2026-06-01")).toBe(true);
  });

  it("refuses an answer outside 0 to 4 at the database, whatever the API lets through", async () => {
    const userId = await makeUser();
    await expect(
      prisma.mrsCheckIn.create({
        data: {
          userId,
          completedOn: new Date("2026-06-02T00:00:00Z"),
          locale: "en",
          instrumentVersion: "MRS-EN-2003",
          ...ANSWERS,
          anxiety: 5,
        },
      }),
    ).rejects.toThrow();
  });

  it("goes when the account goes", async () => {
    const userId = await makeUser();
    await mrsRepository.save(userId, "2026-06-01", { locale: "en", answers: ANSWERS });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.mrsCheckIn.count({ where: { userId } })).toBe(0);
  });
});
