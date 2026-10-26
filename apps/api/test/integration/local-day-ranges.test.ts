import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";

// Calendar-date columns (cycle entries, daily context, treatment start
// and end) filtered by the range the web sends: UTC instants of the
// picked local 00:00 and 23:59:59.999. Proven against real Postgres,
// since the question is how a Date bound meets a DATE column.
const { exportRepository } = await import("../../src/modules/export/export.repository.js");
const { trendsRepository } = await import("../../src/modules/trends/trends.repository.js");
const { cycleRepository } = await import("../../src/modules/cycle/cycle.repository.js");
const { contextRepository } = await import("../../src/modules/context/context.repository.js");
const { reflectionRepository } =
  await import("../../src/modules/reflections/reflection.repository.js");
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

// "1 to 31 October 2026" as each zone's browser sends it.
const ZONES = {
  // UTC+9, no daylight saving.
  "Asia/Tokyo": { from: "2026-09-30T15:00:00.000Z", to: "2026-10-31T14:59:59.999Z" },
  // BST on 1 October, GMT from 25 October.
  "Europe/London": { from: "2026-09-30T23:00:00.000Z", to: "2026-10-31T23:59:59.999Z" },
  // EDT all month.
  "America/New_York": { from: "2026-10-01T04:00:00.000Z", to: "2026-11-01T03:59:59.999Z" },
  // UTC-11, no daylight saving.
  "Pacific/Pago_Pago": { from: "2026-10-01T11:00:00.000Z", to: "2026-11-01T10:59:59.999Z" },
} as const;

const EDGE_DAYS = ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"];
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const dates = (rows: Array<{ date: Date }>) => rows.map((r) => r.date.toISOString().slice(0, 10));

describe.skipIf(!reachable)("calendar-date ranges in exports and trends", () => {
  let userId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `local-days-${randomUUID()}@embr.test`,
        passwordHash: "x",
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    for (const d of EDGE_DAYS) {
      await prisma.cycleEntry.create({
        data: { userId, date: day(d), isPeriodStart: true, flow: "MEDIUM" },
      });
      await prisma.contextLog.create({ data: { userId, date: day(d), alcohol: true } });
    }
    // One treatment ending the day before the range, one starting the day after.
    await prisma.treatment.create({
      data: {
        userId,
        name: "Ended 30 September",
        category: "SUPPLEMENT",
        startDate: day("2026-09-01"),
        endDate: day("2026-09-30"),
      },
    });
    await prisma.treatment.create({
      data: { userId, name: "Started 1 November", category: "HRT", startDate: day("2026-11-01") },
    });
    await prisma.treatment.create({
      data: { userId, name: "Started 1 October", category: "HRT", startDate: day("2026-10-01") },
    });
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  for (const [zone, range] of Object.entries(ZONES)) {
    const query = { from: new Date(range.from), to: new Date(range.to) };

    describe(zone, () => {
      it("exports cycle entries and daily context for exactly 1 to 31 October", async () => {
        expect(dates(await exportRepository.listCycleEntriesForExport(userId, query))).toEqual([
          "2026-10-01",
          "2026-10-31",
        ]);
        expect(dates(await exportRepository.listContextLogsForExport(userId, query))).toEqual([
          "2026-10-01",
          "2026-10-31",
        ]);
      });

      it("exports only treatments active during 1 to 31 October", async () => {
        const names = (await exportRepository.listTreatmentsForExport(userId, query)).map(
          (t) => t.name,
        );
        expect(names).toEqual(["Started 1 October"]);
      });

      it("reads period starts and context for trends from exactly 1 to 31 October", async () => {
        expect(dates(await trendsRepository.periodStartDates(userId, query))).toEqual([
          "2026-10-01",
          "2026-10-31",
        ]);
        expect(
          dates(await trendsRepository.contextLogsForCoOccurrence(userId, query)).sort(),
        ).toEqual(["2026-10-01", "2026-10-31"]);
      });

      it("lists cycle entries and daily context for exactly 1 to 31 October", async () => {
        const page = { ...query, page: 1, pageSize: 50 };
        expect(dates((await cycleRepository.list(userId, page)).items).sort()).toEqual([
          "2026-10-01",
          "2026-10-31",
        ]);
        expect(dates((await contextRepository.list(userId, page)).items).sort()).toEqual([
          "2026-10-01",
          "2026-10-31",
        ]);
      });

      it("reflects only on treatments active during 1 to 31 October", async () => {
        const rows = await reflectionRepository.treatmentsOverlappingPeriod(
          userId,
          query.from,
          query.to,
        );
        expect(rows.map((t) => t.name)).toEqual(["Started 1 October"]);
      });
    });
  }

  it("still treats plain UTC midnight dates, as API callers send them, as those dates", async () => {
    const query = { from: day("2026-10-01"), to: day("2026-10-31") };
    expect(dates(await exportRepository.listCycleEntriesForExport(userId, query))).toEqual([
      "2026-10-01",
      "2026-10-31",
    ]);
  });
});
