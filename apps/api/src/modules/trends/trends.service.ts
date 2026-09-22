import type { TrendsQuery } from "@embr/validation";
import type {
  CycleLengthTrendDto,
  EvidenceStrengthDto,
  SleepDurationBucket,
  StressLevel,
  SymptomCategory,
  SymptomCoOccurrenceDto,
  SymptomContextCoOccurrenceDto,
  SymptomFrequencyDto,
} from "@embr/types";
import { averageCycleLengthDays, computeCycleLengths } from "../../lib/cycle-length.js";
import { trendsRepository } from "./trends.repository.js";
import { detectSymptomCoOccurrence } from "./co-occurrence.js";
import { detectSymptomContextCoOccurrence } from "./context-co-occurrence.js";
import { computeEvidenceStrength } from "./evidence-strength.js";

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
    const intervals = computeCycleLengths(starts.map((s) => s.date));

    const lengths: CycleLengthTrendDto["lengths"] = intervals.map((interval) => ({
      from: toIsoDate(interval.fromDate),
      to: toIsoDate(interval.toDate),
      days: interval.days,
    }));

    return { averageDays: averageCycleLengthDays(intervals), lengths };
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

  /** Same I/O-vs-logic split as coOccurrence above, for the
   * symptom-context pattern engine (context-co-occurrence.ts). */
  async symptomContextCoOccurrence(
    userId: string,
    query: TrendsQuery,
  ): Promise<SymptomContextCoOccurrenceDto | null> {
    const [symptomLogs, contextLogs] = await Promise.all([
      trendsRepository.symptomLogsForCoOccurrence(userId, query),
      trendsRepository.contextLogsForCoOccurrence(userId, query),
    ]);
    return detectSymptomContextCoOccurrence(
      symptomLogs.map((log) => ({
        category: log.category as SymptomCategory,
        occurredAt: log.occurredAt,
      })),
      contextLogs.map((log) => ({
        date: log.date,
        sleepDuration: log.sleepDuration as SleepDurationBucket | null,
        caffeineAfternoon: log.caffeineAfternoon,
        alcohol: log.alcohol,
        stressLevel: log.stressLevel as StressLevel | null,
      })),
    );
  },

  /** Full history, not windowed — see trendsRepository.loggedDates and
   * evidence-strength.ts's own doc comments for why. */
  async evidenceStrength(userId: string): Promise<EvidenceStrengthDto> {
    const { symptomDates, cycleDates } = await trendsRepository.loggedDates(userId);
    const distinctDays = new Set<string>();
    for (const date of symptomDates) distinctDays.add(date.toISOString().slice(0, 10));
    for (const date of cycleDates) distinctDays.add(date.toISOString().slice(0, 10));
    const distinctDaysLogged = distinctDays.size;
    return { strength: computeEvidenceStrength(distinctDaysLogged), distinctDaysLogged };
  },
};
