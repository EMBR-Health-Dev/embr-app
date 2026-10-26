import type { SeverityLevel, SymptomHistoryDayDto } from "@embr/types";

const RANK: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

/** Longer than a year of weeks reads better as months. */
const MAX_WEEKLY_SPAN_DAYS = 371;

export interface TrendBucket {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
  /** Calendar days the bucket covers inside the range. */
  length: number;
  /** Days in the bucket with at least one entry for the symptom. */
  daysLogged: number;
  /** Highest severity recorded in the bucket; null when nothing was recorded. */
  maxSeverity: SeverityLevel | null;
}

export interface TrendBuckets {
  unit: "week" | "month";
  /** Oldest first, so the strip reads left to right in time. */
  buckets: TrendBucket[];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanDays(from: string, to: string): number {
  return (
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

function lastDayOfMonth(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function bucketRanges(
  from: string,
  to: string,
): { unit: TrendBuckets["unit"]; ranges: [string, string][] } {
  if (spanDays(from, to) <= MAX_WEEKLY_SPAN_DAYS) {
    // Weeks end on the last day of the range, so the newest bucket is
    // always the last seven days; the oldest may be shorter.
    const ranges: [string, string][] = [];
    let end = to;
    while (end >= from) {
      const start = addDays(end, -6);
      ranges.unshift([start < from ? from : start, end]);
      end = addDays(end, -7);
    }
    return { unit: "week", ranges };
  }
  const ranges: [string, string][] = [];
  let start = from;
  while (start <= to) {
    const monthEnd = lastDayOfMonth(start);
    ranges.push([start, monthEnd > to ? to : monthEnd]);
    start = addDays(monthEnd, 1);
  }
  return { unit: "month", ranges };
}

/**
 * Splits one symptom's recorded days into weeks (or months, for spans
 * over a year) so frequency can be read in time order. A bucket with no
 * entry has daysLogged 0 and no severity: it is unrecorded, not a
 * symptom free stretch.
 */
export function trendBuckets(from: string, to: string, days: SymptomHistoryDayDto[]): TrendBuckets {
  const { unit, ranges } = bucketRanges(from, to);
  const buckets = ranges.map(([start, end]) => {
    let daysLogged = 0;
    let maxSeverity: SeverityLevel | null = null;
    for (const day of days) {
      if (day.date < start || day.date > end) continue;
      daysLogged += 1;
      if (!maxSeverity || RANK[day.maxSeverity] > RANK[maxSeverity]) maxSeverity = day.maxSeverity;
    }
    return { start, end, length: spanDays(start, end), daysLogged, maxSeverity };
  });
  return { unit, buckets };
}
