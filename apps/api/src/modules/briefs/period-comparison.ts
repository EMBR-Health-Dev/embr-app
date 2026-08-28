import { addDays, daysBetween } from "../treatments/treatment-impact.js";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — deterministic comparison over
 * already-aggregated symptom frequency, nothing more. This module
 * knows nothing about what a frequency change *means* (better, worse,
 * expected) — that's Stage 4's job, not built yet for this feature —
 * it only computes the arithmetic difference between two counts.
 */

export interface PeriodWindow {
  /** Inclusive, matching the rest of this codebase's date-range
   * filtering convention (see exportRepository's gte/lte). */
  from: Date;
  /** Inclusive. */
  to: Date;
}

/**
 * The comparison period is the same span, immediately preceding the
 * requested period with no gap and no overlap — e.g. requested
 * 2026-08-01 → 2026-08-30 (a 30-day inclusive span) compares against
 * 2026-07-02 → 2026-07-31 (also 30 days, ending the day before the
 * requested period starts). Reuses treatment-impact.ts's addDays/
 * daysBetween rather than a second, independent implementation of
 * "add N days" / "days between two dates" — same fair-window
 * reasoning that feature already established, not a competing
 * definition of a comparison window.
 */
export function computePreviousPeriod(fromDate: Date, toDate: Date): PeriodWindow {
  const spanDays = daysBetween(fromDate, toDate);
  const to = addDays(fromDate, -1);
  const from = addDays(to, -spanDays);
  return { from, to };
}

export type FrequencyChangeDirection = "increased" | "decreased" | "unchanged";

export interface SymptomFrequencyComparisonEntry {
  category: string;
  currentCount: number;
  previousCount: number;
  absoluteChange: number;
  /** Null when previousCount is 0 — "0 → 4" has no meaningful
   * percentage (it is not "+400%", it is "newly reported"); a null
   * here is the deterministic layer refusing to manufacture a number
   * that would misrepresent the underlying data, not a missing value
   * to be filled in later. */
  percentageChange: number | null;
  direction: FrequencyChangeDirection;
}

/**
 * Compares two already-aggregated frequency summaries (the output
 * shape of computeSymptomFrequency — only {category, count} is read
 * here, so a full SymptomFrequencyEntry[] with severityBreakdown works
 * unchanged, same "extra field is inert" precedent
 * symptom-frequency.ts's own doc comment already establishes).
 *
 * Returns one entry per category that appears in *either* period —
 * never a category absent from both, which would be a manufactured
 * "0 vs 0, unchanged" entry for something nobody ever logged at all.
 * A category present in only one period is a real, correctly-derived
 * fact (0 in the other period), not an invented one.
 *
 * Sorted alphabetically by category — deterministic and reproducible
 * regardless of database row order or which period happened to be
 * queried first, the same reproducibility requirement co-occurrence.ts
 * documents for its own category ordering. Deliberately not sorted by
 * magnitude of change: that would require a tie-break decision this
 * function has no basis for making, and the category taxonomy is a
 * small, fixed, already-orderable set.
 */
export function compareSymptomFrequency(
  current: Array<{ category: string; count: number }>,
  previous: Array<{ category: string; count: number }>,
): SymptomFrequencyComparisonEntry[] {
  const currentByCategory = new Map(current.map((e) => [e.category, e.count]));
  const previousByCategory = new Map(previous.map((e) => [e.category, e.count]));

  const categories = new Set([...currentByCategory.keys(), ...previousByCategory.keys()]);

  return [...categories].sort().map((category) => {
    const currentCount = currentByCategory.get(category) ?? 0;
    const previousCount = previousByCategory.get(category) ?? 0;
    const absoluteChange = currentCount - previousCount;

    const direction: FrequencyChangeDirection =
      absoluteChange > 0 ? "increased" : absoluteChange < 0 ? "decreased" : "unchanged";

    const percentageChange =
      previousCount === 0 ? null : Math.round((absoluteChange / previousCount) * 100);

    return { category, currentCount, previousCount, absoluteChange, percentageChange, direction };
  });
}
