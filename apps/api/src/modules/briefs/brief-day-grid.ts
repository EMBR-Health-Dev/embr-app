import type { ClinicalBriefDto } from "@embr/types";

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

/**
 * The BRIEF's period day by day, for the PDF: one row per symptom (most
 * logged first), the days it was recorded, and the days with any entry
 * at all. Built only from dates stored with the BRIEF, so a re-download
 * reproduces it. Null when the BRIEF predates per day dates. Mirrors
 * apps/web/src/lib/brief-day-grid.ts.
 */
export function briefDayGrid(brief: ClinicalBriefDto) {
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
