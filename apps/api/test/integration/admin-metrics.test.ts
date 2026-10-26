import { afterAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// The admin metrics are SQL over the real tables, so they are proven
// against the Postgres CI provides. Other suites share the database, so
// every assertion is a difference: metrics before, known rows added,
// metrics after.
const { computeAdminMetrics } = await import("../../src/modules/admin/admin.metrics.js");
const { prisma } = await import("../../src/lib/prisma.js");
const { authRepository } = await import("../../src/modules/auth/auth.repository.js");

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
        createdAt: new Date(Date.now() - 12 * DAY),
        updatedAt: new Date(Date.now() - 12 * DAY),
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

  // Week 4 retention, by its written definition (docs/METRICS.md):
  // signup day is day 0; retained means she made or updated an entry on
  // any of days 21 to 27; the cohort is everyone whose day 27 has fully
  // passed, signed up 28 to 55 days ago, so no one is counted before
  // they had the whole week. A fixed reference time (06:00 UTC today)
  // keeps the edges independent of when the suite runs.
  describe("week 4 retention", () => {
    const now = new Date();
    now.setUTCHours(6, 0, 0, 0);
    const todayUtc = now.getTime() - 6 * 3600_000;
    // Noon UTC on day `day` for someone who signed up `ago` days before today.
    const at = (ago: number, day = 0) => new Date(todayUtc - ago * DAY + day * DAY + 12 * 3600_000);
    const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));

    async function signedUp(ago: number) {
      const user = await person();
      await prisma.user.update({ where: { id: user.id }, data: { createdAt: at(ago) } });
      return user;
    }
    async function symptomOn(userId: string, ago: number, day: number) {
      await prisma.symptomLog.create({
        data: {
          userId,
          category: "HOT_FLASH",
          severity: "MILD",
          occurredAt: at(ago, day),
          createdAt: at(ago, day),
          updatedAt: at(ago, day),
        },
      });
    }
    async function change(setup: () => Promise<void>) {
      const before = await computeAdminMetrics(now);
      await setup();
      const after = await computeAdminMetrics(now);
      return {
        cohort: after.retentionWeek4.cohort - before.retentionWeek4.cohort,
        retained: after.retentionWeek4.retained - before.retentionWeek4.retained,
      };
    }

    it("retains an entry made on day 21 or day 27, and not on day 20 or day 28", async () => {
      expect(
        await change(async () => {
          await symptomOn((await signedUp(40)).id, 40, 21);
          await symptomOn((await signedUp(40)).id, 40, 27);
        }),
      ).toEqual({ cohort: 2, retained: 2 });
      expect(
        await change(async () => {
          const user = await signedUp(40);
          await symptomOn(user.id, 40, 20);
          await symptomOn(user.id, 40, 28);
        }),
      ).toEqual({ cohort: 1, retained: 0 });
    });

    it("retains her for updating an answer in week 4 that she first gave earlier", async () => {
      expect(
        await change(async () => {
          const user = await signedUp(40);
          await prisma.contextLog.create({
            data: {
              userId: user.id,
              date: dateOnly(at(40, 10)),
              alcohol: true,
              createdAt: at(40, 10),
              updatedAt: at(40, 24),
            },
          });
        }),
      ).toEqual({ cohort: 1, retained: 1 });
    });

    it("does not retain her for an entry about week 4 that she filled in later", async () => {
      // On day 35 she added a cycle entry dated day 23.
      expect(
        await change(async () => {
          const user = await signedUp(40);
          await prisma.cycleEntry.create({
            data: {
              userId: user.id,
              date: dateOnly(at(40, 23)),
              createdAt: at(40, 35),
              updatedAt: at(40, 35),
            },
          });
        }),
      ).toEqual({ cohort: 1, retained: 0 });
    });

    it("keeps people who deleted their account in the cohort, retained or not", async () => {
      const retainedUser = await signedUp(40);
      await symptomOn(retainedUser.id, 40, 23);
      const lapsedUser = await signedUp(40);
      await symptomOn(lapsedUser.id, 40, 5);
      const before = await computeAdminMetrics(now);

      // Both delete their accounts; an admin deleting theirs leaves no row.
      const admin = await person({ role: "ADMIN" });
      const rowsBefore = await prisma.deletedAccount.count();
      for (const id of [retainedUser.id, lapsedUser.id, admin.id]) {
        expect(await authRepository.deleteUserAccount(id)).toBe("DELETED");
      }
      expect(await prisma.deletedAccount.count()).toBe(rowsBefore + 2);

      const after = await computeAdminMetrics(now);
      expect(after.retentionWeek4.cohort).toBe(before.retentionWeek4.cohort);
      expect(after.retentionWeek4.retained).toBe(before.retentionWeek4.retained);

      // Only dates and the flag are stored: no id, email or content.
      const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'deleted_accounts' ORDER BY column_name`,
      );
      expect(columns.map((c) => c.column_name)).toEqual([
        "activeWeek4",
        "deletedDate",
        "id",
        "signupDate",
      ]);
    });

    it("puts only whole weeks in the cohort: signed up 28 to 55 days ago", async () => {
      // Signed up at noon, after the 06:00 reference time of day.
      expect(await change(async () => void (await signedUp(28)))).toEqual({
        cohort: 1,
        retained: 0,
      });
      expect(await change(async () => void (await signedUp(55)))).toEqual({
        cohort: 1,
        retained: 0,
      });
      expect(await change(async () => void (await signedUp(27)))).toEqual({
        cohort: 0,
        retained: 0,
      });
      expect(await change(async () => void (await signedUp(56)))).toEqual({
        cohort: 0,
        retained: 0,
      });
    });
  });

  it("counts a person active on the day she made an entry, whatever date it describes", async () => {
    const now = new Date();
    const before = await computeAdminMetrics(now);

    // Long-standing account; today she fills in a period start from two months ago.
    const user = await person({ daysAgo: 200 });
    await prisma.cycleEntry.create({
      data: {
        userId: user.id,
        date: new Date(new Date(Date.now() - 60 * DAY).toISOString().slice(0, 10)),
      },
    });
    // Another made her entries 10 days ago, for days that read as recent.
    const lapsed = await person({ daysAgo: 200 });
    await prisma.symptomLog.create({
      data: {
        userId: lapsed.id,
        category: "HOT_FLASH",
        severity: "MILD",
        occurredAt: new Date(Date.now() - 3 * DAY),
        createdAt: new Date(Date.now() - 10 * DAY),
        updatedAt: new Date(Date.now() - 10 * DAY),
      },
    });

    const after = await computeAdminMetrics(now);
    expect(after.activity.active7d - before.activity.active7d).toBe(1);
    expect(after.activity.active30d - before.activity.active30d).toBe(2);
  });

  it("never returns anything but numbers and dates", async () => {
    const metrics = await computeAdminMetrics();
    const text = JSON.stringify(metrics);
    expect(text).not.toMatch(/HOT_FLASH|FATIGUE|@embr\.test/);
  });
});
