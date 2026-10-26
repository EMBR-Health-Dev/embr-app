import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs the real history writer against the Postgres CI provides, the
// way scripts/seed-demo.mjs runs it, and reads the rows back.
const { prisma } = await import("../../src/lib/prisma.js");
const { symptomService } = await import("../../src/modules/symptoms/symptom.service.js");

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
const apiDir = fileURLToPath(new URL("../..", import.meta.url));
const emails: string[] = [];

function runWriter(plan: unknown, env: Record<string, string | undefined> = {}) {
  return spawnSync("npx", ["tsx", "src/scripts/seed-demo-history.ts"], {
    cwd: apiDir,
    input: JSON.stringify(plan),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe.skipIf(!reachable)("demo history writer against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.$disconnect();
  });

  it("writes weeks of past check ins and period starts the API itself would refuse", async () => {
    const email = `seed-it-${randomUUID()}@embr.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, passwordHash: "x" } });
    const plan = {
      email,
      timeZone: "Asia/Tokyo",
      days: [
        {
          date: "2026-08-01",
          entries: [
            { category: "HOT_FLASH", severity: "MILD" },
            { category: "FATIGUE", severity: "SEVERE" },
          ],
          periodStart: false,
        },
        { date: "2026-08-02", entries: [], periodStart: true },
        {
          date: "2026-09-30",
          entries: [{ category: "BRAIN_FOG", severity: "MODERATE" }],
          periodStart: false,
        },
      ],
    };

    const first = runWriter(plan);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).toContain("2 daily check ins and 1 period starts");
    // Counts only: no symptom name reaches the output.
    expect(first.stdout).not.toMatch(/HOT_FLASH|FATIGUE|BRAIN_FOG/);

    // Re-running replaces, never duplicates.
    expect(runWriter(plan).status).toBe(0);

    const logs = await prisma.symptomLog.findMany({
      where: { userId: user.id },
      orderBy: [{ checkInDate: "asc" }, { category: "asc" }],
    });
    expect(
      logs.map((l) => [l.checkInDate!.toISOString().slice(0, 10), l.category, l.severity]),
    ).toEqual([
      ["2026-08-01", "HOT_FLASH", "MILD"],
      ["2026-08-01", "FATIGUE", "SEVERE"],
      ["2026-09-30", "BRAIN_FOG", "MODERATE"],
    ]);
    // Local noon in Tokyo is 03:00 UTC.
    expect(logs[0]!.occurredAt.toISOString()).toBe("2026-08-01T03:00:00.000Z");
    const cycles = await prisma.cycleEntry.findMany({ where: { userId: user.id } });
    expect(cycles.map((c) => [c.date.toISOString().slice(0, 10), c.isPeriodStart])).toEqual([
      ["2026-08-02", true],
    ]);

    // The production path still refuses the same date.
    await expect(
      symptomService.saveCheckIn(user.id, "2026-08-01", { timeZone: "Asia/Tokyo", entries: [] }),
    ).rejects.toThrow(/today or yesterday/);
  });

  it("refuses an account that does not exist", () => {
    const result = runWriter({
      email: `missing-${randomUUID()}@embr.test`,
      timeZone: "UTC",
      days: [],
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not exist");
  });

  it("refuses production before touching the database", () => {
    const result = runWriter(
      { email: "x@embr.test", timeZone: "UTC", days: [] },
      { NODE_ENV: "production" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NODE_ENV=production");
  });
});
