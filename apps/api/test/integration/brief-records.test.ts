import { afterAll, describe, expect, it, vi } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Known records with hand-checked figures: every number a BRIEF shows
// is worked out below from the entries themselves, not captured from a
// run, so a change in counting shows up as a failing figure here.
// Only the AI wording call is stubbed; every figure is computed by the
// deterministic engine before the AI is involved.
vi.mock("../../src/modules/briefs/brief.ai.js", () => ({
  briefAi: {
    generate: vi.fn(async () => ({
      narrative: "stub",
      discussionTopics: ["Is this pattern worth discussing?"],
      patterns: [],
      modelId: "stub-model",
      promptVersion: "stub",
    })),
  },
}));

const { prisma } = await import("../../src/lib/prisma.js");
const { briefService } = await import("../../src/modules/briefs/brief.service.js");
const { symptomRepository } = await import("../../src/modules/symptoms/symptom.repository.js");
const { localNoon, toDateColumn } = await import("../../src/modules/symptoms/symptom-check-in.js");
const { localDate } = await import("../../src/modules/trends/symptom-history.js");

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

type Severity = "MILD" | "MODERATE" | "SEVERE";
type CheckIn = [date: string, entries: Array<[category: string, severity: Severity]>];

/*
 * Record "steady": a BRIEF for 1 to 28 February 2026 (28 days). The
 * previous period it is compared with is therefore 4 to 31 January.
 */
const CHECK_INS: CheckIn[] = [
  // Before the previous period: counted nowhere.
  ["2026-01-03", [["NIGHT_SWEATS", "MILD"]]],
  // Previous period, first and last day.
  ["2026-01-04", [["HOT_FLASH", "MILD"]]],
  [
    "2026-01-31",
    [
      ["HOT_FLASH", "MODERATE"],
      ["SLEEP_DISTURBANCE", "MILD"],
    ],
  ],
  // The BRIEF's own period.
  [
    "2026-02-01",
    [
      ["HOT_FLASH", "MODERATE"],
      ["SLEEP_DISTURBANCE", "MODERATE"],
    ],
  ],
  [
    "2026-02-02",
    [
      ["HOT_FLASH", "SEVERE"],
      ["SLEEP_DISTURBANCE", "MILD"],
    ],
  ],
  [
    "2026-02-10",
    [
      ["HOT_FLASH", "MILD"],
      ["FATIGUE", "MILD"],
    ],
  ],
  ["2026-02-11", [["FATIGUE", "MODERATE"]]],
  [
    "2026-02-12",
    [
      ["FATIGUE", "MILD"],
      ["SLEEP_DISTURBANCE", "SEVERE"],
      ["HOT_FLASH", "MODERATE"],
    ],
  ],
  ["2026-02-28", [["HOT_FLASH", "MILD"]]],
  // After the period: counted nowhere.
  ["2026-03-01", [["HOT_FLASH", "SEVERE"]]],
];

type ContextDay = {
  date: string;
  nightSweats?: "NONE" | "ONE" | "TWO_TO_THREE" | "FOUR_PLUS";
  workImpact?: "NONE" | "DID_LESS" | "MISSED_TIME";
  exercise?: "NONE" | "LIGHT" | "MODERATE" | "VIGOROUS";
  sleepDuration?: "UNDER_6H" | "SIX_TO_SEVEN_H" | "SEVEN_PLUS_H";
};

const CONTEXT: ContextDay[] = [
  // Outside the period on both sides.
  { date: "2026-01-31", nightSweats: "FOUR_PLUS", workImpact: "MISSED_TIME", exercise: "VIGOROUS" },
  { date: "2026-03-01", nightSweats: "FOUR_PLUS", workImpact: "MISSED_TIME", exercise: "VIGOROUS" },
  // Seven answered mornings and exercise days; work answered on six.
  { date: "2026-02-01", nightSweats: "NONE", workImpact: "NONE", exercise: "NONE" },
  { date: "2026-02-02", nightSweats: "ONE", workImpact: "DID_LESS", exercise: "LIGHT" },
  { date: "2026-02-03", nightSweats: "ONE", workImpact: "NONE", exercise: "VIGOROUS" },
  { date: "2026-02-04", nightSweats: "TWO_TO_THREE", workImpact: "DID_LESS", exercise: "MODERATE" },
  { date: "2026-02-05", nightSweats: "NONE", workImpact: "NONE", exercise: "LIGHT" },
  { date: "2026-02-06", nightSweats: "FOUR_PLUS", workImpact: "MISSED_TIME", exercise: "NONE" },
  { date: "2026-02-07", nightSweats: "ONE", exercise: "LIGHT" },
  // Only sleep logged: unanswered questions must not count as "none".
  { date: "2026-02-08", sleepDuration: "UNDER_6H" },
];

/** The same record for a new person, rows written in the given order. */
async function seed(timeZone: string, order: "forward" | "reverse" = "forward") {
  const user = await prisma.user.create({
    data: {
      email: `brief-rec-${randomUUID()}@embr.test`,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
    },
  });
  userIds.push(user.id);
  const ordered = <T>(rows: T[]) => (order === "forward" ? rows : [...rows].reverse());

  for (const [date, entries] of ordered(CHECK_INS)) {
    await symptomRepository.saveCheckIn(
      user.id,
      toDateColumn(date),
      ordered(entries).map(([category, severity]) => ({
        category: category as never,
        severity,
      })),
      localNoon(date, timeZone),
    );
  }
  for (const day of ordered(CONTEXT)) {
    await prisma.contextLog.create({
      data: { userId: user.id, ...day, date: toDateColumn(day.date) },
    });
  }
  // A period that started before the BRIEF, and one inside it with
  // three days of flow.
  const cycle = [
    { date: "2026-01-20", isPeriodStart: true, flow: "MEDIUM" as const },
    { date: "2026-02-15", isPeriodStart: true, flow: "MEDIUM" as const },
    { date: "2026-02-16", isPeriodStart: false, flow: "HEAVY" as const },
    { date: "2026-02-17", isPeriodStart: false, flow: "LIGHT" as const },
  ];
  for (const entry of ordered(cycle)) {
    await prisma.cycleEntry.create({
      data: { userId: user.id, ...entry, date: toDateColumn(entry.date) },
    });
  }
  const treatments = [
    // Ended before the period: not in the BRIEF.
    {
      name: "Ended before",
      category: "HRT" as const,
      startDate: "2025-12-01",
      endDate: "2026-01-15",
    },
    // Ongoing through the period: listed, but no before and after.
    { name: "Ongoing", category: "LIFESTYLE" as const, startDate: "2026-01-01", endDate: null },
    // Started inside the period: listed, with before and after counts.
    { name: "Magnesium", category: "SUPPLEMENT" as const, startDate: "2026-02-10", endDate: null },
  ];
  for (const t of ordered(treatments)) {
    await prisma.treatment.create({
      data: {
        userId: user.id,
        name: t.name,
        category: t.category,
        startDate: toDateColumn(t.startDate),
        endDate: t.endDate ? toDateColumn(t.endDate) : null,
      },
    });
  }
  return user.id;
}

async function generate(userId: string, timeZone: string) {
  const { start, end } = localRange("2026-02-01", "2026-02-28", timeZone);
  return briefService.generate(userId, start, end, "en", timeZone);
}

/** Every figure a BRIEF stores, without ids or generation times. */
function figures(brief: Awaited<ReturnType<typeof generate>>) {
  return {
    symptomSummary: brief.symptomSummary,
    cycleSummary: brief.cycleSummary,
    treatmentSummary: brief.treatmentSummary,
    frequencyComparison: brief.frequencyComparison,
    persistentSymptoms: brief.persistentSymptoms,
    coOccurrence: brief.coOccurrence,
    treatmentImpact: brief.treatmentImpact?.map(({ treatmentId: _id, ...rest }) => rest),
    nightSweatsRecall: brief.nightSweatsRecall,
    workImpact: brief.workImpact,
    exercise: brief.exercise,
    lastRecordedPeriod: brief.lastRecordedPeriod,
  };
}

const ZONES = ["Europe/London", "Asia/Tokyo", "America/New_York"];

describe.skipIf(!reachable)("BRIEF records with hand-checked figures", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it.each(ZONES)("record steady gives exactly the expected figures in %s", async (timeZone) => {
    const brief = await generate(await seed(timeZone), timeZone);

    // Symptoms in 1 to 28 February, counted per entry. Ties are listed
    // alphabetically: FATIGUE before SLEEP_DISTURBANCE.
    expect(brief.symptomSummary).toEqual([
      // 1 Feb moderate, 2 Feb severe, 10 Feb mild, 12 Feb moderate, 28 Feb mild
      { category: "HOT_FLASH", count: 5, severityBreakdown: { MILD: 2, MODERATE: 2, SEVERE: 1 } },
      // 10 Feb mild, 11 Feb moderate, 12 Feb mild
      { category: "FATIGUE", count: 3, severityBreakdown: { MILD: 2, MODERATE: 1 } },
      // 1 Feb moderate, 2 Feb mild, 12 Feb severe
      {
        category: "SLEEP_DISTURBANCE",
        count: 3,
        severityBreakdown: { MILD: 1, MODERATE: 1, SEVERE: 1 },
      },
    ]);

    // Previous period 4 to 31 January: hot flashes on 4 and 31 Jan,
    // sleep disturbance on 31 Jan. The 3 Jan night sweats are outside it.
    expect(brief.frequencyComparison).toEqual([
      {
        category: "FATIGUE",
        currentCount: 3,
        previousCount: 0,
        absoluteChange: 3,
        percentageChange: null,
        direction: "increased",
        currentDates: ["2026-02-10", "2026-02-11", "2026-02-12"],
        previousDates: [],
      },
      {
        category: "HOT_FLASH",
        currentCount: 5,
        previousCount: 2,
        absoluteChange: 3,
        percentageChange: 150,
        direction: "increased",
        currentDates: ["2026-02-01", "2026-02-02", "2026-02-10", "2026-02-12", "2026-02-28"],
        previousDates: ["2026-01-04", "2026-01-31"],
      },
      {
        category: "SLEEP_DISTURBANCE",
        currentCount: 3,
        previousCount: 1,
        absoluteChange: 2,
        percentageChange: 200,
        direction: "increased",
        currentDates: ["2026-02-01", "2026-02-02", "2026-02-12"],
        previousDates: ["2026-01-31"],
      },
    ]);

    // Present in the previous period and 3 or more times now.
    expect(brief.persistentSymptoms).toEqual(["HOT_FLASH", "SLEEP_DISTURBANCE"]);

    // Hot flash and sleep disturbance share 1, 2 and 12 Feb.
    expect(brief.coOccurrence).toMatchObject({
      categoryA: "HOT_FLASH",
      categoryB: "SLEEP_DISTURBANCE",
      days: 3,
    });

    // One start inside the period (15 Feb): no cycle length yet. Three
    // days with flow (15, 16, 17 Feb); the 20 Jan start is outside.
    expect(brief.cycleSummary).toEqual({
      averageCycleLengthDays: null,
      cycleCount: 0,
      periodDaysLogged: 3,
    });
    // The last day with flow on or before 28 Feb.
    expect(brief.lastRecordedPeriod).toEqual({
      date: "2026-02-17",
      monthsBeforeBriefEnd: 0,
      source: "logged",
    });

    // Treatments overlapping the period, newest start first; the one
    // that ended on 15 Jan is left out.
    expect(brief.treatmentSummary.map((t) => t.name)).toEqual(["Magnesium", "Ongoing"]);
    // Only the treatment that started inside the period. Entries, not
    // days: 14 days before 10 Feb (27 Jan to 9 Feb) holds 31 Jan (2),
    // 1 Feb (2), 2 Feb (2); 14 days from 10 Feb holds 10 Feb (2),
    // 11 Feb (1), 12 Feb (3).
    expect(brief.treatmentImpact).toHaveLength(1);
    expect(brief.treatmentImpact![0]).toMatchObject({
      name: "Magnesium",
      before: { logCount: 6, days: 14 },
      after: { logCount: 6, days: 14 },
      insufficientData: false,
    });

    // Seven answered mornings: NONE 1 and 5 Feb, ONE 2, 3 and 7 Feb,
    // TWO_TO_THREE 4 Feb, FOUR_PLUS 6 Feb. 8 Feb (sleep only) is not "none".
    expect(brief.nightSweatsRecall).toEqual({
      morningsAnswered: 7,
      breakdown: { NONE: 2, ONE: 3, TWO_TO_THREE: 1, FOUR_PLUS: 1 },
    });
    // Six answered days: below the seven needed for a breakdown.
    expect(brief.workImpact).toEqual({ daysAnswered: 6, breakdown: null });
    // NONE 1 and 6 Feb, LIGHT 2, 5 and 7 Feb, MODERATE 4 Feb, VIGOROUS 3 Feb.
    expect(brief.exercise).toEqual({
      daysAnswered: 7,
      breakdown: { NONE: 2, LIGHT: 3, MODERATE: 1, VIGOROUS: 1 },
    });
  });

  it.each(ZONES)(
    "identical records give identical figures, whatever order rows were written in (%s)",
    async (timeZone) => {
      const first = figures(await generate(await seed(timeZone, "forward"), timeZone));
      const second = figures(await generate(await seed(timeZone, "reverse"), timeZone));
      expect(second).toEqual(first);
    },
  );

  it("traces every count back to the entries it came from", async () => {
    const timeZone = "Europe/London";
    const userId = await seed(timeZone);
    const brief = await generate(userId, timeZone);

    const logs = await prisma.symptomLog.findMany({ where: { userId } });
    const inPeriod = logs.filter((log) => {
      const day = localDate(log.occurredAt, timeZone);
      return day >= "2026-02-01" && day <= "2026-02-28";
    });
    for (const entry of brief.symptomSummary) {
      const source = inPeriod.filter((log) => log.category === entry.category);
      expect(entry.count).toBe(source.length);
      const bySeverity = Object.values(entry.severityBreakdown).reduce((a, b) => a + b, 0);
      expect(bySeverity).toBe(entry.count);
    }
    expect(brief.symptomSummary.reduce((a, s) => a + s.count, 0)).toBe(inPeriod.length);
    for (const entry of brief.frequencyComparison ?? []) {
      expect(entry.currentDates).toHaveLength(entry.currentCount);
      expect(entry.previousDates).toHaveLength(entry.previousCount);
    }
  });

  it("keeps its figures when the record changes after generation", async () => {
    const timeZone = "Europe/London";
    const userId = await seed(timeZone);
    const brief = await generate(userId, timeZone);

    await symptomRepository.saveCheckIn(
      userId,
      toDateColumn("2026-02-05"),
      [{ category: "HOT_FLASH" as never, severity: "SEVERE" }],
      localNoon("2026-02-05", timeZone),
    );
    const stored = await briefService.get(brief.id, userId);
    expect(figures(stored)).toEqual(figures(brief));
  });
});
