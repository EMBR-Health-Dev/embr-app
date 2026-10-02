import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Exercises the real upsert, the (user, symptom, date) unique key and
// the scoped delete against the Postgres CI provides via DATABASE_URL.
const { symptomRepository } = await import("../../src/modules/symptoms/symptom.repository.js");
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
    data: { email: `checkin-it-${randomUUID()}@embr.test`, passwordHash: "x" },
  });
  userIds.push(user.id);
  return user.id;
}

const DAY = new Date("2026-10-01T00:00:00.000Z");
const AT = new Date("2026-10-01T09:00:00.000Z");

describe.skipIf(!reachable)("symptom check in against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("saves several symptoms in one call", async () => {
    const userId = await makeUser();
    const saved = await symptomRepository.saveCheckIn(
      userId,
      DAY,
      [
        { category: "BRAIN_FOG", severity: "MODERATE" },
        { category: "FATIGUE", severity: "SEVERE" },
        { category: "SLEEP_DISTURBANCE", severity: "MILD" },
      ],
      AT,
    );
    expect(saved.map((l) => [l.category, l.severity]).sort()).toEqual([
      ["BRAIN_FOG", "MODERATE"],
      ["FATIGUE", "SEVERE"],
      ["SLEEP_DISTURBANCE", "MILD"],
    ]);
  });

  it("edits in place: no duplicates, original time and notes kept, removed symptoms deleted", async () => {
    const userId = await makeUser();
    const first = await symptomRepository.saveCheckIn(
      userId,
      DAY,
      [
        { category: "BRAIN_FOG", severity: "MODERATE" },
        { category: "FATIGUE", severity: "SEVERE" },
      ],
      AT,
    );
    const fog = first.find((l) => l.category === "BRAIN_FOG")!;
    await prisma.symptomLog.update({ where: { id: fog.id }, data: { notes: "afternoon meeting" } });

    const later = new Date("2026-10-01T20:00:00.000Z");
    const edited = await symptomRepository.saveCheckIn(
      userId,
      DAY,
      [
        { category: "BRAIN_FOG", severity: "SEVERE" },
        { category: "HOT_FLASH", severity: "MILD" },
      ],
      later,
    );

    expect(edited).toHaveLength(2);
    const editedFog = edited.find((l) => l.category === "BRAIN_FOG")!;
    expect(editedFog.id).toBe(fog.id);
    expect(editedFog.severity).toBe("SEVERE");
    expect(editedFog.occurredAt).toEqual(AT);
    expect(editedFog.notes).toBe("afternoon meeting");
    expect(edited.find((l) => l.category === "HOT_FLASH")!.occurredAt).toEqual(later);
    expect(await prisma.symptomLog.count({ where: { userId } })).toBe(2);
  });

  it("never touches individually logged symptoms or another day's check in", async () => {
    const userId = await makeUser();
    const single = await symptomRepository.create(userId, {
      category: "BRAIN_FOG",
      severity: "MILD",
      occurredAt: AT,
    });
    await symptomRepository.saveCheckIn(
      userId,
      new Date("2026-09-30T00:00:00.000Z"),
      [{ category: "FATIGUE", severity: "MILD" }],
      new Date("2026-09-30T12:00:00.000Z"),
    );
    await symptomRepository.saveCheckIn(
      userId,
      DAY,
      [{ category: "BRAIN_FOG", severity: "SEVERE" }],
      AT,
    );
    // Clearing the day's check in removes only its own rows.
    const cleared = await symptomRepository.saveCheckIn(userId, DAY, [], AT);

    expect(cleared).toEqual([]);
    expect((await prisma.symptomLog.findUnique({ where: { id: single.id } }))!.severity).toBe(
      "MILD",
    );
    expect(await prisma.symptomLog.count({ where: { userId } })).toBe(2);
  });

  it("rejects a second check in row for the same symptom and date at the database", async () => {
    const userId = await makeUser();
    const data = {
      userId,
      category: "ANXIETY" as const,
      severity: "MILD" as const,
      occurredAt: AT,
      checkInDate: DAY,
    };
    await prisma.symptomLog.create({ data });
    await expect(prisma.symptomLog.create({ data })).rejects.toThrow();
  });
});
