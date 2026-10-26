import type { ClinicalBriefDto, SymptomCategory } from "@embr/types";

/** Every calendar date from `from` to `to` (YYYY-MM-DD), inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export interface BriefDayGrid {
  days: string[];
  rows: Array<{ category: SymptomCategory; logged: Set<string> }>;
  /** Days with at least one symptom entry; every other day has no entry recorded. */
  recorded: Set<string>;
}

/**
 * The BRIEF's period day by day: one row per symptom (most logged
 * first, as in the frequency section), a mark on each day it was
 * recorded. Built only from the dates already stored with the BRIEF,
 * so an old BRIEF reads the same later. Null when the BRIEF predates
 * per day dates.
 */
export function briefDayGrid(brief: ClinicalBriefDto): BriefDayGrid | null {
  if (!brief.frequencyComparison) return null;
  const days = datesBetween(brief.fromDate.slice(0, 10), brief.toDate.slice(0, 10));
  const inPeriod = new Set(days);
  const datesByCategory = new Map(
    brief.frequencyComparison.map((e) => [e.category, e.currentDates ?? []]),
  );
  const rows = brief.symptomSummary.map(({ category }) => ({
    category,
    logged: new Set((datesByCategory.get(category) ?? []).filter((d) => inPeriod.has(d))),
  }));
  const recorded = new Set(rows.flatMap((r) => [...r.logged]));
  return { days, rows, recorded };
}
