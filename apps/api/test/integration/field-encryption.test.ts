import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

// Personal text against the real Postgres CI provides: what is stored on
// disk is ciphertext, the app reads plaintext, rows written before
// encryption still read, and the backfill script encrypts them.
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
const createdEmails: string[] = [];

async function newUser() {
  const email = `enc-it-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  return prisma.user.create({ data: { email, passwordHash: "x" } });
}

describe.skipIf(!reachable)("personal text encryption against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("stores notes, treatment names and BRIEF wording as ciphertext and reads them back", async () => {
    const user = await newUser();
    const note = await prisma.note.create({
      data: { userId: user.id, title: "Dr Sato", body: "Ask about night sweats" },
    });
    expect(note.title).toBe("Dr Sato");

    await prisma.treatment.create({
      data: {
        userId: user.id,
        name: "Estradiol gel",
        category: "HRT",
        startDate: new Date("2026-01-01"),
        notes: "1 pump",
      },
    });
    await prisma.symptomLog.create({
      data: {
        userId: user.id,
        category: "HOT_FLASH",
        severity: "MILD",
        occurredAt: new Date(),
        notes: "during the board meeting",
      },
    });
    await prisma.clinicalBrief.create({
      data: {
        userId: user.id,
        fromDate: new Date("2026-07-01"),
        toDate: new Date("2026-09-30"),
        symptomSummary: [],
        cycleSummary: {},
        treatmentSummary: [{ name: "Estradiol gel", category: "HRT" }],
        aiNarrative: "Hot flashes were logged on 9 days.",
        aiDiscussionTopics: ["Could my sleep be related to hot flashes?"],
      },
    });

    const stored = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT n.title, n.body, t.name, t.notes AS tnotes, s.notes AS snotes,
             b."aiNarrative", b."treatmentSummary"::text AS ts, b."aiDiscussionTopics"::text AS topics
      FROM notes n
      JOIN treatments t ON t."userId" = n."userId"
      JOIN symptom_logs s ON s."userId" = n."userId"
      JOIN clinical_briefs b ON b."userId" = n."userId"
      WHERE n."userId" = ${user.id}`;
    const onDisk = JSON.stringify(stored);
    for (const secret of [
      "Sato",
      "night sweats",
      "Estradiol",
      "1 pump",
      "board meeting",
      "9 days",
      "Could my sleep",
    ]) {
      expect(onDisk).not.toContain(secret);
    }
    expect(String(stored[0]!.body)).toMatch(/^enc:v1:/);

    const [readNote] = await prisma.note.findMany({ where: { userId: user.id } });
    expect(readNote).toMatchObject({ title: "Dr Sato", body: "Ask about night sweats" });
    const [treatment] = await prisma.treatment.findMany({ where: { userId: user.id } });
    expect(treatment).toMatchObject({ name: "Estradiol gel", notes: "1 pump" });
    const brief = await prisma.clinicalBrief.findFirst({ where: { userId: user.id } });
    expect(brief).toMatchObject({
      aiNarrative: "Hot flashes were logged on 9 days.",
      treatmentSummary: [{ name: "Estradiol gel", category: "HRT" }],
      aiDiscussionTopics: ["Could my sleep be related to hot flashes?"],
    });
  });

  it("encrypts inside interactive transactions and on update and upsert", async () => {
    const user = await newUser();
    const note = await prisma.$transaction((tx) =>
      tx.note.create({ data: { userId: user.id, title: "in a transaction", body: "" } }),
    );
    await prisma.note.update({ where: { id: note.id }, data: { body: "updated text" } });
    await prisma.cycleEntry.upsert({
      where: { userId_date: { userId: user.id, date: new Date("2026-09-01") } },
      create: { userId: user.id, date: new Date("2026-09-01"), notes: "first" },
      update: { notes: "second" },
    });
    const rows = await prisma.$queryRaw<Array<{ title: string; body: string }>>`
      SELECT title, body FROM notes WHERE id = ${note.id}`;
    expect(rows[0]!.title).toMatch(/^enc:v1:/);
    expect(rows[0]!.body).toMatch(/^enc:v1:/);
    const cycle = await prisma.$queryRaw<Array<{ notes: string }>>`
      SELECT notes FROM cycle_entries WHERE "userId" = ${user.id}`;
    expect(cycle[0]!.notes).toMatch(/^enc:v1:/);
    expect((await prisma.note.findUnique({ where: { id: note.id } }))!.body).toBe("updated text");
  });

  it("reads text written before encryption, and the backfill script encrypts it", async () => {
    const user = await newUser();
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO notes (id, "userId", title, body, "updatedAt")
      VALUES (${id}, ${user.id}, 'old title', 'old body', now())`;
    expect(await prisma.note.findUnique({ where: { id } })).toMatchObject({
      title: "old title",
      body: "old body",
    });

    execFileSync("npx", ["tsx", join(__dirname, "../../src/scripts/encrypt-existing.ts")], {
      env: process.env,
      stdio: "pipe",
    });

    const rows = await prisma.$queryRaw<Array<{ title: string; body: string }>>`
      SELECT title, body FROM notes WHERE id = ${id}`;
    expect(rows[0]!.title).toMatch(/^enc:v1:/);
    expect(rows[0]!.body).toMatch(/^enc:v1:/);
    expect(await prisma.note.findUnique({ where: { id } })).toMatchObject({
      title: "old title",
      body: "old body",
    });
  }, 60_000);
});
