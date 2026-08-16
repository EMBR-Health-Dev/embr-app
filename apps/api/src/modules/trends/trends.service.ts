import type { TrendsQuery } from "@embr/validation";
import type {
  CycleLengthTrendDto,
  SymptomCategory,
  SymptomCoOccurrenceDto,
  SymptomFrequencyDto,
} from "@embr/types";
import { trendsRepository } from "./trends.repository.js";
import { detectSymptomCoOccurrence } from "./co-occurrence.js";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const trendsService = {
  async symptomFrequency(userId: string, query: TrendsQuery): Promise<SymptomFrequencyDto[]> {
    const rows = await trendsRepository.symptomFrequency(userId, query);
    return rows
      .map((row) => ({ category: row.category as SymptomCategory, count: row.count }))
      .sort((a, b) => b.count - a.count);
  },

  async cycleLength(userId: string, query: TrendsQuery): Promise<CycleLengthTrendDto> {
    const starts = await trendsRepository.periodStartDates(userId, query);

    const lengths: CycleLengthTrendDto["lengths"] = [];
    for (let i = 1; i < starts.length; i++) {
      const prev = starts[i - 1]!.date;
      const curr = starts[i]!.date;
      const days = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      lengths.push({ from: toIsoDate(prev), to: toIsoDate(curr), days });
    }

    const averageDays =
      lengths.length > 0
        ? Math.round(lengths.reduce((sum, l) => sum + l.days, 0) / lengths.length)
        : null;

    return { averageDays, lengths };
  },

  /** Fetches the raw rows and hands them to the pure pattern-engine
   * function (co-occurrence.ts) — this service method owns the I/O,
   * the function owns the (fully unit-testable, DB-independent)
   * detection logic. */
  async coOccurrence(userId: string, query: TrendsQuery): Promise<SymptomCoOccurrenceDto | null> {
    const logs = await trendsRepository.symptomLogsForCoOccurrence(userId, query);
    return detectSymptomCoOccurrence(
      logs.map((log) => ({
        category: log.category as SymptomCategory,
        occurredAt: log.occurredAt,
      })),
    );
  },
};
