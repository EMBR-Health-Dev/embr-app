import type { BriefFrequencyComparisonEntryDto } from "@embr/types";

/**
 * Display order for "Compared with the previous period": the largest
 * change in days first, so what moved most is read first. Ties go to the
 * symptom recorded more often in this period, then alphabetical. Only an
 * ordering of counts already in the BRIEF: no threshold, no verdict.
 * apps/api/src/modules/briefs/period-comparison-order.ts mirrors this for
 * the PDF, so the two never disagree.
 */
export function byLargestChange<
  T extends Pick<BriefFrequencyComparisonEntryDto, "category" | "currentCount" | "previousCount">,
>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      Math.abs(b.currentCount - b.previousCount) - Math.abs(a.currentCount - a.previousCount) ||
      b.currentCount - a.currentCount ||
      a.category.localeCompare(b.category),
  );
}
