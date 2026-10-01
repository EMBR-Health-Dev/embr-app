import { api } from "./api";
import { toIsoDate } from "./date-format";

/**
 * How far back a person's record goes, and how much is in it — so the
 * app can show the whole history rather than only the most recent
 * window. Built from the existing list endpoints (all ordered newest
 * first): a pageSize-1 request gives each source's total, and asking for
 * the last page at that size gives its oldest item. No new API surface.
 */
export interface RecordSpan {
  /** YYYY-MM-DD of the earliest symptom, cycle entry or treatment start; null for an empty record. */
  start: string | null;
  symptomCount: number;
  cycleCount: number;
  treatmentCount: number;
}

export async function fetchRecordSpan(): Promise<RecordSpan> {
  const [symptoms, cycle, treatments] = await Promise.all([
    api.symptomLogs.list({ pageSize: 1 }),
    api.cycleEntries.list({ pageSize: 1 }),
    api.treatments.list({ pageSize: 1 }),
  ]);

  const [oldestSymptom, oldestCycle, oldestTreatment] = await Promise.all([
    symptoms.total > 0 ? api.symptomLogs.list({ page: symptoms.total, pageSize: 1 }) : null,
    cycle.total > 0 ? api.cycleEntries.list({ page: cycle.total, pageSize: 1 }) : null,
    treatments.total > 0 ? api.treatments.list({ page: treatments.total, pageSize: 1 }) : null,
  ]);

  const candidates = [
    oldestSymptom?.items[0] ? toIsoDate(new Date(oldestSymptom.items[0].occurredAt)) : null,
    oldestCycle?.items[0]?.date ?? null,
    oldestTreatment?.items[0]?.startDate ?? null,
  ].filter((value): value is string => value !== null);

  return {
    start: candidates.length > 0 ? candidates.sort()[0]! : null,
    symptomCount: symptoms.total,
    cycleCount: cycle.total,
    treatmentCount: treatments.total,
  };
}

export type HistoryRange = "90d" | "12m" | "all";
export const HISTORY_RANGES: HistoryRange[] = ["90d", "12m", "all"];

export function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

/**
 * The YYYY-MM-DD a range starts on. "all" starts at the record's first
 * entry, so every count shown for it covers exactly the person's own
 * history; with no entries yet it falls back to the 90-day window.
 */
export function rangeStartDate(range: HistoryRange, recordStart: string | null): string {
  if (range === "12m") return daysAgoIsoDate(365);
  if (range === "all" && recordStart) return recordStart;
  return daysAgoIsoDate(90);
}

/** Whole days from a YYYY-MM-DD start to today, inclusive. */
export function daysSince(startIsoDate: string): number {
  const start = new Date(`${startIsoDate}T00:00:00`);
  const today = new Date(`${toIsoDate(new Date())}T00:00:00`);
  return Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1);
}
