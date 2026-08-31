import type { SymptomCategory } from "@embr/types";
import type { TimelineQuery } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";

/** Same reasoning as trends.repository.ts's SYMPTOM_LOG_ROW_CAP — the
 * weekly bucketing in symptom-buckets.ts is a set/sequence operation
 * across raw rows that can't be expressed as a single Postgres
 * aggregate, so it has to happen in application code once the rows are
 * fetched. A generous safety ceiling, not a real pagination story. */
const SYMPTOM_LOG_ROW_CAP = 5000;

export const timelineRepository = {
  /** Raw category + occurredAt rows for symptom-buckets.ts to bucket by
   * week — deliberately not a GROUP BY, matching
   * trends.repository.ts's symptomLogsForCoOccurrence precedent for
   * the same reason. */
  async symptomLogsForTimeline(
    userId: string,
    query: TimelineQuery,
  ): Promise<Array<{ category: SymptomCategory; occurredAt: Date }>> {
    const rows = await prisma.symptomLog.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      select: { category: true, occurredAt: true },
      take: SYMPTOM_LOG_ROW_CAP,
    });
    return rows.map((row: { category: string; occurredAt: Date }) => ({
      category: row.category as SymptomCategory,
      occurredAt: row.occurredAt,
    }));
  },

  /** Every treatment that overlaps the range at all — same overlap
   * semantics as treatmentRepository.listOverlappingRange (an ongoing
   * treatment that started before `from` still appears, since a
   * timeline needs to show it was active throughout). Timeline events
   * are then derived per treatment (started, and ended if endDate
   * falls within range) by timeline.service.ts, not here — this stays
   * a plain data fetch. */
  listTreatmentsOverlappingRange(userId: string, from: Date | undefined, to: Date | undefined) {
    return prisma.treatment.findMany({
      where: {
        userId,
        ...(to ? { startDate: { lte: to } } : {}),
        ...(from ? { OR: [{ endDate: null }, { endDate: { gte: from } }] } : {}),
      },
      orderBy: { startDate: "asc" },
    });
  },

  /** Briefs generated within the range, ordered by when they were
   * generated (createdAt) — a brief's own fromDate/toDate describe the
   * data it summarizes, but the timeline event is "a brief was
   * generated on this day," which is createdAt. List-shaped fields
   * only, matching briefRepository.listForUser's existing "no AI
   * content in the list view" precedent — a timeline event links to
   * the full brief rather than duplicating its narrative inline. */
  listBriefsGeneratedInRange(userId: string, from: Date | undefined, to: Date | undefined) {
    return prisma.clinicalBrief.findMany({
      where: {
        userId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: { id: true, fromDate: true, toDate: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  },
};
