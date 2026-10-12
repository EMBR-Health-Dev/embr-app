import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The admin metrics are SQL over the real tables, so they are proven
// against the Postgres CI provides. Other suites share the database, so
// every assertion is a difference: metrics before, known rows added,
// metrics after.
const { computeAdminMetrics } = await import("../../src/modules/admin/admin.metrics.js");
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
const DAY = 86_400_000;

async function person(opts: { role?: "MEMBER" | "ADMIN"; daysAgo?: number } = {}) {
  const email = `metrics-${randomUUID()}@embr.test`;
  createdEmails.push(email);
  return prisma.user.create({
    data: {
      email,
      passwordHash: "x",
      role: opts.role ?? "MEMBER",
      emailVerifiedAt: new Date(),
      createdAt: new Date(Date.now() - (opts.daysAgo ?? 0) * DAY),
    },
  });
}

describe.skipIf(!reachable)("computeAdminMetrics against Postgres", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  it("counts people, activity, week 4 retention and BRIEFs, and leaves admins out", async () => {
    const before = await computeAdminMetrics();

    // Active this week, with a BRIEF she generated and downloaded.
    const active = await person();
    await prisma.symptomLog.create({
      data: { userId: active.id, category: "HOT_FLASH", severity: "MILD", occurredAt: new Date() },
    });
    await prisma.symptomLog.create({
      data: {
        userId: active.id,
        category: "FATIGUE",
        severity: "MILD",
        occurredAt: new Date(Date.now() - 2 * DAY),
      },
    });
    const today = new Date(new Date().toISOString().slice(0, 10));
    await prisma.contextLog.create({ data: { userId: active.id, date: today, alcohol: false } });
    await prisma.clinicalBrief.create({
      data: {
        userId: active.id,
        fromDate: new Date(Date.now() - 30 * DAY),
        toDate: new Date(),
        symptomSummary: [],
        cycleSummary: {},
        treatmentSummary: [],
        aiNarrative: "",
        aiDiscussionTopics: [],
      },
    });
    await prisma.auditLog.create({
      data: { userId: active.id, action: "CLINICAL_BRIEF_DOWNLOADED" },
    });

    // Signed up 35 days ago and logged on day 23: retained. Signed up 40
    // days ago with nothing logged: in the cohort, not retained.
    const retained = await person({ daysAgo: 35 });
    await prisma.cycleEntry.create({
      data: {
        userId: retained.id,
        date: new Date(new Date(Date.now() - 12 * DAY).toISOString().slice(0, 10)),
      },
    });
    await person({ daysAgo: 40 });

    // An admin's own logging never counts.
    const admin = await person({ role: "ADMIN" });
    await prisma.symptomLog.create({
      data: { userId: admin.id, category: "HOT_FLASH", severity: "MILD", occurredAt: new Date() },
    });

    const after = await computeAdminMetrics();

    expect(after.accounts.total - before.accounts.total).toBe(3);
    expect(after.accounts.new7d - before.accounts.new7d).toBe(1);
    expect(after.accounts.new30d - before.accounts.new30d).toBe(1);
    expect(after.activity.active7d - before.activity.active7d).toBe(1);
    expect(after.activity.active30d - before.activity.active30d).toBe(2);
    expect(after.retentionWeek4.cohort - before.retentionWeek4.cohort).toBe(2);
    expect(after.retentionWeek4.retained - before.retentionWeek4.retained).toBe(1);
    expect(after.briefs.generated7d - before.briefs.generated7d).toBe(1);
    expect(after.briefs.peopleWithBrief - before.briefs.peopleWithBrief).toBe(1);
    expect(after.briefs.downloaded30d - before.briefs.downloaded30d).toBe(1);

    expect(after.weekly).toHaveLength(8);
    const sum = (m: typeof after, key: "activePeople" | "newAccounts" | "briefsGenerated") =>
      m.weekly.reduce((total, w) => total + w[key], 0);
    expect(sum(after, "newAccounts") - sum(before, "newAccounts")).toBe(3);
    expect(sum(after, "briefsGenerated") - sum(before, "briefsGenerated")).toBe(1);
  });

  it("never returns anything but numbers and dates", async () => {
    const metrics = await computeAdminMetrics();
    const text = JSON.stringify(metrics);
    expect(text).not.toMatch(/HOT_FLASH|FATIGUE|@embr\.test/);
  });
});
