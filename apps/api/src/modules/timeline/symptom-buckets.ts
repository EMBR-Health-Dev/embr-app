import type { SymptomCategory } from "@embr/types";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine) — deterministic counting over normalized symptom
 * data, nothing more, matching co-occurrence.ts's and
 * treatment-impact.ts's exact precedent. This module knows nothing
 * about what a change in weekly count *means* (better, worse,
 * unrelated); it only buckets logs into calendar weeks and computes a
 * plain count delta against the previous non-empty week. Interpretation
 * and any AI narration are out of scope here, same as the other two
 * Stage-3 modules.
 */

export interface WeeklySymptomBucket {
  /** ISO date (Monday) the week starts on. */
  weekStart: string;
  /** Exclusive — weekStart + 7 days. */
  weekEnd: string;
  totalCount: number;
  /** Sorted descending by count, ties broken alphabetically by
   * category — same tie-break reasoning as computeSymptomFrequency. */
  categoryCounts: Array<{ category: SymptomCategory; count: number }>;
  /** Null for the first non-empty week in the series, since there's no
   * prior week to compare against. Otherwise the signed percentage
   * change in totalCount versus the most recent earlier week that had
   * at least one log — an empty week in between is skipped rather than
   * treated as a 0, so a single quiet week doesn't manufacture a
   * misleading +/-100% swing on either side of it. */
  percentChangeFromPreviousNonEmptyWeek: number | null;
}

/** Monday of the ISO week containing `date`, at UTC midnight. Matches
 * this module's UTC-calendar-date convention (see
 * treatment-impact.ts's identical reasoning for why UTC, not local
 * time, is the right boundary for a deterministic, reproducible
 * computation). */
function startOfIsoWeekUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Buckets raw symptom logs into consecutive ISO weeks spanning the
 * full range from the earliest to the latest log (inclusive), so gaps
 * with zero logs still appear as empty weeks rather than being
 * silently skipped — a real signal for a longitudinal view ("nothing
 * logged this week" is different from "no week existed"). Empty weeks
 * carry `totalCount: 0` and an empty `categoryCounts`, and are not
 * given their own percent-change value (there is nothing to compare),
 * but do NOT reset what "previous non-empty week" means for the next
 * bucket that does have data.
 *
 * Given the same input array, always returns the same output,
 * regardless of row order — same determinism requirement
 * detectSymptomCoOccurrence documents for itself.
 */
export function bucketSymptomLogsByWeek(
  logs: Array<{ category: SymptomCategory; occurredAt: Date }>,
): WeeklySymptomBucket[] {
  if (logs.length === 0) return [];

  const sorted = [...logs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const firstWeekStart = startOfIsoWeekUtc(sorted[0]!.occurredAt);
  const lastWeekStart = startOfIsoWeekUtc(sorted[sorted.length - 1]!.occurredAt);

  const countsByWeekStart = new Map<string, Map<SymptomCategory, number>>();
  for (const log of sorted) {
    const weekKey = toIsoDate(startOfIsoWeekUtc(log.occurredAt));
    let byCategory = countsByWeekStart.get(weekKey);
    if (!byCategory) {
      byCategory = new Map();
      countsByWeekStart.set(weekKey, byCategory);
    }
    byCategory.set(log.category, (byCategory.get(log.category) ?? 0) + 1);
  }

  const buckets: WeeklySymptomBucket[] = [];
  let previousNonEmptyTotal: number | null = null;

  for (
    let weekStart = firstWeekStart;
    weekStart.getTime() <= lastWeekStart.getTime();
    weekStart = addDays(weekStart, 7)
  ) {
    const weekKey = toIsoDate(weekStart);
    const byCategory = countsByWeekStart.get(weekKey);

    const categoryCounts = byCategory
      ? [...byCategory.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
      : [];

    const totalCount = categoryCounts.reduce((sum, entry) => sum + entry.count, 0);

    let percentChangeFromPreviousNonEmptyWeek: number | null = null;
    if (totalCount > 0) {
      if (previousNonEmptyTotal !== null && previousNonEmptyTotal > 0) {
        percentChangeFromPreviousNonEmptyWeek = Math.round(
          ((totalCount - previousNonEmptyTotal) / previousNonEmptyTotal) * 100,
        );
      }
      previousNonEmptyTotal = totalCount;
    }

    buckets.push({
      weekStart: weekKey,
      weekEnd: toIsoDate(addDays(weekStart, 7)),
      totalCount,
      categoryCounts,
      percentChangeFromPreviousNonEmptyWeek,
    });
  }

  return buckets;
}
