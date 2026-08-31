import type { SeverityLevel, SymptomCategory, TreatmentImpactDto } from "@embr/types";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — deterministic counting over
 * normalized symptom data, nothing more, matching co-occurrence.ts's
 * exact precedent. This module knows nothing about what a change in
 * log frequency *means* (better, worse, unrelated); it only counts
 * calendar days and symptom logs in two fixed windows either side of
 * a treatment's start date. Interpretation and any AI narration are
 * explicitly out of scope here — see Milestone 18's own doc entry on
 * why wiring treatment data into BRIEF's AI needs a separate,
 * deliberate conversation about efficacy-claim drift that this
 * feature does not touch at all.
 */
export const TREATMENT_IMPACT_WINDOW_DAYS = 14;

/** Below this many days of the "after" window actually having
 * elapsed, a before/after comparison is closer to noise than signal
 * — the same "floor, not a target" reasoning MIN_CO_OCCURRENCE_DAYS
 * documents for the co-occurrence feature. The "before" window is
 * always exactly TREATMENT_IMPACT_WINDOW_DAYS by construction (pure
 * calendar arithmetic ending at startDate), so it can never itself be
 * short — only "after" can be, for a treatment that started recently
 * or already ended shortly after starting. */
export const MIN_TREATMENT_IMPACT_DAYS = 3;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export interface TreatmentImpactWindow {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

/**
 * "before" is always [startDate - windowDays, startDate) — a fixed
 * span regardless of how long ago the treatment started, so the two
 * windows being compared are always the same length by default,
 * making the comparison fair rather than lopsided (e.g. 60 days of
 * "after" against 14 of "before").
 *
 * "after" is [startDate, min(endDate ?? today, startDate + windowDays))
 * — capped at the same windowDays so an ongoing treatment doesn't
 * keep growing its own "after" window indefinitely (a treatment
 * started a year ago would otherwise compare 14 days of "before"
 * against 365 days of "after", which is a different kind of unfair
 * comparison in the other direction), and bounded below by
 * `startDate` itself so it never goes negative when a treatment
 * already ended on or before it started (i.e. same-day start/end).
 */
export function computeTreatmentImpactWindows(params: {
  startDate: Date;
  endDate: Date | null;
  today: Date;
  windowDays?: number;
}): { before: TreatmentImpactWindow; after: TreatmentImpactWindow } {
  const windowDays = params.windowDays ?? TREATMENT_IMPACT_WINDOW_DAYS;

  const before: TreatmentImpactWindow = {
    from: addDays(params.startDate, -windowDays),
    to: params.startDate,
  };

  const afterUpperBound = params.endDate ?? params.today;
  const cappedAfterEnd = addDays(params.startDate, windowDays);
  const afterTo =
    afterUpperBound < cappedAfterEnd
      ? afterUpperBound < params.startDate
        ? params.startDate
        : afterUpperBound
      : cappedAfterEnd;

  const after: TreatmentImpactWindow = { from: params.startDate, to: afterTo };

  return { before, after };
}

export interface TreatmentImpactBreakdownRow {
  category: string;
  severity: string;
  count: number;
}

/** Sums breakdown rows into one count per category, sorted by count
 * descending with an alphabetical tie-break — same convention
 * computeSymptomFrequency (trends) and bucketSymptomLogsByWeek
 * (timeline) both already use, so a category ranking reads the same
 * way everywhere in the app. Only categories that were actually
 * logged appear; a full 14-entry table mostly showing zero would be
 * noise, not signal, for a before/after comparison. */
function summarizeCategoryCounts(
  rows: TreatmentImpactBreakdownRow[],
): Array<{ category: SymptomCategory; count: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([category, count]) => ({ category: category as SymptomCategory, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

/** Same sum-by-key idea as summarizeCategoryCounts, but fixed in
 * MILD/MODERATE/SEVERE order rather than sorted by count, with every
 * severity present even at 0. Severity has its own inherent order
 * that matters more here than a frequency ranking: a before/after
 * comparison is meant to be scanned as "did the SEVERE row shrink,"
 * which only works if it's always in the same place, not jumping
 * around (or disappearing entirely) depending on which window had
 * more of it. */
function summarizeSeverityCounts(
  rows: TreatmentImpactBreakdownRow[],
): Array<{ severity: SeverityLevel; count: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.severity, (totals.get(row.severity) ?? 0) + row.count);
  }
  return (["MILD", "MODERATE", "SEVERE"] as const).map((severity) => ({
    severity,
    count: totals.get(severity) ?? 0,
  }));
}

export function buildTreatmentImpact(params: {
  treatmentId: string;
  startDate: Date;
  endDate: Date | null;
  today: Date;
  beforeLogCount: number;
  afterLogCount: number;
  beforeBreakdown?: TreatmentImpactBreakdownRow[];
  afterBreakdown?: TreatmentImpactBreakdownRow[];
  windowDays?: number;
}): TreatmentImpactDto {
  const windowDays = params.windowDays ?? TREATMENT_IMPACT_WINDOW_DAYS;
  const { before, after } = computeTreatmentImpactWindows({ ...params, windowDays });
  const afterDays = daysBetween(after.from, after.to);
  const beforeBreakdown = params.beforeBreakdown ?? [];
  const afterBreakdown = params.afterBreakdown ?? [];

  return {
    treatmentId: params.treatmentId,
    windowDays,
    before: {
      logCount: params.beforeLogCount,
      days: daysBetween(before.from, before.to),
      categoryCounts: summarizeCategoryCounts(beforeBreakdown),
      severityCounts: summarizeSeverityCounts(beforeBreakdown),
    },
    after: {
      logCount: params.afterLogCount,
      days: afterDays,
      categoryCounts: summarizeCategoryCounts(afterBreakdown),
      severityCounts: summarizeSeverityCounts(afterBreakdown),
    },
    insufficientData: afterDays < MIN_TREATMENT_IMPACT_DAYS,
  };
}
