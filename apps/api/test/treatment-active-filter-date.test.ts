import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captures whatever `where`/args treatment.repository.ts actually
// passes to Prisma, without needing a live Postgres to observe the
// DB-level consequence — the bug this guards against lives entirely
// in how the application code constructs the "today" filter value,
// which is fully observable at this boundary.
const findManyCalls: unknown[] = [];
const countCalls: unknown[] = [];

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    treatment: {
      findMany: vi.fn((args: unknown) => {
        findManyCalls.push(args);
        return Promise.resolve([]);
      }),
      count: vi.fn((args: unknown) => {
        countCalls.push(args);
        return Promise.resolve(0);
      }),
    },
  },
}));

describe("treatmentRepository.list — active filter date construction", () => {
  beforeEach(() => {
    findManyCalls.length = 0;
    countCalls.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * startDate/endDate are @db.Date columns, always written and read as
   * pure calendar dates (see cycle.mappers.ts's identical doc comment
   * on why: a @db.Date column is a calendar day, not a point in time).
   * Every stored startDate/endDate is parsed via z.coerce.date() from
   * a "YYYY-MM-DD" string, which per the ISO 8601 spec always resolves
   * to UTC midnight of that day. The "active" filter's own notion of
   * "today" must be constructed the same way — a bare `new Date()`
   * carries the current time-of-day, which for a user in a timezone
   * ahead of UTC (e.g. JST, UTC+9 — a real, not hypothetical,
   * population for this app) means the server's UTC calendar date can
   * still be "yesterday" for several hours after that user's local
   * date, and therefore their own local calendar day, has already
   * rolled over. A treatment they log as starting "today" would then
   * fail the startDate <= today comparison and appear inactive for
   * however many hours remain until UTC catches up — this test locks
   * in that "today" is always UTC-midnight-truncated so that skew
   * can't reappear.
   */
  it("uses a UTC-midnight-truncated date for the active filter, not the current instant", async () => {
    // A time deliberately NOT at UTC midnight, so a bug that leaks
    // time-of-day into the comparison would be caught here regardless
    // of what wall-clock time the test suite happens to run at.
    vi.setSystemTime(new Date("2026-06-15T14:37:22.123Z"));

    const { treatmentRepository } =
      await import("../src/modules/treatments/treatment.repository.js");
    await treatmentRepository.list("user-1", { active: true, page: 1, pageSize: 20 });

    expect(findManyCalls).toHaveLength(1);
    const where = (findManyCalls[0] as { where: { startDate: { lte: Date } } }).where;
    expect(where.startDate.lte.toISOString()).toBe("2026-06-15T00:00:00.000Z");

    const countWhere = (countCalls[0] as { where: { startDate: { lte: Date } } }).where;
    expect(countWhere.startDate.lte.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("the endDate >= today comparison also uses the same UTC-midnight-truncated date", async () => {
    vi.setSystemTime(new Date("2026-01-01T23:59:59.999Z"));

    const { treatmentRepository } =
      await import("../src/modules/treatments/treatment.repository.js");
    await treatmentRepository.list("user-1", { active: true, page: 1, pageSize: 20 });

    const where = (
      findManyCalls[0] as {
        where: { OR: Array<{ endDate: null } | { endDate: { gte: Date } }> };
      }
    ).where;
    const gteBranch = where.OR.find((b) => "endDate" in b && b.endDate !== null) as {
      endDate: { gte: Date };
    };
    expect(gteBranch.endDate.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
