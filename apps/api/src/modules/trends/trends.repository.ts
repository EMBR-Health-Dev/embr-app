import type { TrendsQuery } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";

/**
 * Cycle length can't be computed as a DB-side aggregate the way symptom
 * frequency can — it's a sequential diff between consecutive
 * period-start dates, which has to happen in application code once the
 * dates are fetched in order. This cap is the same pattern
 * exportRepository established in Milestone 6: a generous safety
 * ceiling, not a real pagination story. Symptom frequency doesn't need
 * an equivalent cap because COUNT ... GROUP BY runs entirely in
 * Postgres and returns one row per category, never one row per log.
 */
const CYCLE_ENTRY_ROW_CAP = 5000;

export const trendsRepository = {
  /**
   * True DB-side aggregate (COUNT ... GROUP BY category) — this is the
   * fix for the pageSize:100 undercounting the client-side approach had
   * (see Milestone 5's known limitation): every matching row is counted
   * by Postgres, none of them ever cross the wire.
   */
  async symptomFrequency(
    userId: string,
    query: TrendsQuery,
  ): Promise<Array<{ category: string; count: number }>> {
    const where = {
      userId,
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const rows = await prisma.symptomLog.groupBy({
      by: ["category"],
      where,
      _count: { category: true },
    });

    return rows.map((row: { category: string; _count: { category: number } }) => ({
      category: row.category,
      count: row._count.category,
    }));
  },

  /** Period-start dates only, ordered ascending, for the cycle-length diff. */
  periodStartDates(userId: string, query: TrendsQuery): Promise<Array<{ date: Date }>> {
    return prisma.cycleEntry.findMany({
      where: {
        userId,
        isPeriodStart: true,
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      select: { date: true },
      orderBy: { date: "asc" },
      take: CYCLE_ENTRY_ROW_CAP,
    });
  },
};
