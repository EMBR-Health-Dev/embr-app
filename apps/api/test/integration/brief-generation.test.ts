import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Generates a real BRIEF from a real Postgres record, with only the AI
// wording call stubbed: every figure checked here is computed by the
// deterministic engine before the AI is involved. The record has
// entries for "today" and "yesterday" around a range that ends
// yesterday, the way the web check in now fills them in.
vi.mock("../../src/modules/briefs/brief.ai.js", () => ({
  briefAi: {
    generate: vi.fn(async () => ({
      narrative: "stub",
      discussionTopics: ["Is this pattern worth discussing?"],
      patterns: [],
    })),
  },
}));

const { prisma } = await import("../../src/lib/prisma.js");
const { briefService } = await import("../../src/modules/briefs/brief.service.js");
const { symptomRepository } = await import("../../src/modules/symptoms/symptom.repository.js");
const { localNoon, toDateColumn } = await import("../../src/modules/symptoms/symptom-check-in.js");

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

/** The instants the web sends for a local calendar range (startOfLocalDay / endOfLocalDay). */
function localRange(from: string, to: string, timeZone: string) {
  const start = new Date(localNoon(from, timeZone).getTime() - 12 * 3_600_000);
  const end = new Date(localNoon(to, timeZone).getTime() + 12 * 3_600_000 - 1);
  return { start, end };
}

async function recordFor(timeZone: string) {
  const user = await prisma.user.create({
    data: {
      email: `brief-it-${randomUUID()}@embr.test`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  const checkIn = (date: string, entries: Parameters<typeof symptomRepository.saveCheckIn>[2]) =>
    symptomRepository.saveCheckIn(user.id, toDateColumn(date), entries, localNoon(date, timeZone));

  // Yesterday (the range's last day) and today (outside it).
  await checkIn("2026-10-24", [
    { category: "BRAIN_FOG", severity: "SEVERE" },
    { category: "FATIGUE", severity: "MILD" },
  ]);
  await checkIn("2026-10-25", [{ category: "HOT_FLASH", severity: "MODERATE" }]);
  // The range's first day.
  await checkIn("2026-10-01", [{ category: "BRAIN_FOG", severity: "MILD" }]);

  // Work impact: the day before, the first day, seven days ending yesterday, and today.
  const work: Array<[string, "NONE" | "DID_LESS" | "MISSED_TIME"]> = [
    ["2026-10-01", "NONE"],
    ...["18", "19", "20", "21", "22", "23", "24"].map(
      (d) => [`2026-10-${d}`, "DID_LESS"] as [string, "DID_LESS"],
    ),
    ["2026-10-25", "MISSED_TIME"],
    // The day before the range.
    ["2026-09-30", "MISSED_TIME"],
  ];
  for (const [date, workImpact] of work) {
    await prisma.contextLog.create({
      data: {
        userId: user.id,
        date: toDateColumn(date),
        workImpact,
        nightSweats: date === "2026-10-25" || date === "2026-09-30" ? "FOUR_PLUS" : "ONE",
      },
    });
  }
  // Period starts the day before, on the first day, yesterday and today.
  for (const date of ["2026-09-30", "2026-10-01", "2026-10-24", "2026-10-25"]) {
    await prisma.cycleEntry.create({
      data: { userId: user.id, date: toDateColumn(date), isPeriodStart: true, flow: "MEDIUM" },
    });
  }
  // Treatments: one ended the day before, one started on the first day, one starts today.
  await prisma.treatment.createMany({
    data: [
      {
        userId: user.id,
        name: "Ended before",
        category: "OTHER",
        startDate: toDateColumn("2026-09-01"),
        endDate: toDateColumn("2026-09-30"),
      },
      {
        userId: user.id,
        name: "Started first day",
        category: "OTHER",
        startDate: toDateColumn("2026-10-01"),
      },
      {
        userId: user.id,
        name: "Starts today",
        category: "OTHER",
        startDate: toDateColumn("2026-10-25"),
      },
    ],
  });
  return user.id;
}

describe.skipIf(!reachable)("BRIEF generation against Postgres, today and yesterday", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it.each(["America/New_York", "Asia/Tokyo", "Europe/London", "Pacific/Pago_Pago"])(
    "counts exactly 1 to 24 October in %s, leaving today out",
    async (timeZone) => {
      const userId = await recordFor(timeZone);
      const { start, end } = localRange("2026-10-01", "2026-10-24", timeZone);
      const brief = await briefService.generate(userId, start, end, "en");

      expect([brief.fromDate.slice(0, 10), brief.toDate.slice(0, 10)]).toEqual([
        "2026-10-01",
        "2026-10-24",
      ]);
      // Symptoms: yesterday's two and the first day's one; today's hot flash is outside.
      const counts = Object.fromEntries(brief.symptomSummary.map((s) => [s.category, s.count]));
      expect(counts).toEqual({ BRAIN_FOG: 2, FATIGUE: 1 });
      expect(
        brief.symptomSummary.find((s) => s.category === "BRAIN_FOG")!.severityBreakdown,
      ).toEqual(expect.objectContaining({ MILD: 1, SEVERE: 1 }));

      // Work impact: the first day plus seven days ending yesterday, never today.
      expect(brief.workImpact).toEqual({
        daysAnswered: 8,
        breakdown: { NONE: 1, DID_LESS: 7, MISSED_TIME: 0 },
      });
      // Night sweats recall follows the same calendar days.
      expect(brief.nightSweatsRecall?.morningsAnswered).toBe(8);
      // Cycle: the first day's and yesterday's period starts only.
      expect(brief.cycleSummary.periodDaysLogged).toBe(2);
      // Treatments: only the one that overlaps 1 to 24 October.
      expect(brief.treatmentSummary.map((t) => t.name)).toEqual(["Started first day"]);
    },
  );
});
