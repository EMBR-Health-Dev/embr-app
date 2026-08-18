export interface CycleLengthInterval {
  fromDate: Date;
  toDate: Date;
  days: number;
}

/**
 * Given period-start dates in any order, computes the day-count
 * between each consecutive pair once sorted ascending. Facts only —
 * presentation (ISO-date-string formatting, bare day-count arrays,
 * etc.) is each caller's own concern, not this function's; see
 * export/pdf.ts and trends.service.ts for the two different shapes
 * this same computation currently needs to support.
 *
 * Sorts defensively rather than trusting the caller's input order —
 * strictly safer than trends.service.ts's previous behavior (which
 * relied on its repository query's ORDER BY), and matches what
 * export/pdf.ts's version already did.
 *
 * 0 or 1 input dates produce an empty result — there's no "between"
 * to compute yet. Duplicate dates for the same user are prevented by
 * CycleEntry's own @@unique([userId, date]) constraint, not handled
 * specially here.
 */
export function computeCycleLengths(periodStartDates: Date[]): CycleLengthInterval[] {
  const sorted = [...periodStartDates].sort((a, b) => a.getTime() - b.getTime());

  const intervals: CycleLengthInterval[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const fromDate = sorted[i - 1]!;
    const toDate = sorted[i]!;
    const days = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    intervals.push({ fromDate, toDate, days });
  }
  return intervals;
}

/** The same round(sum/count) formula was independently written three
 * times across export/pdf.ts, brief.service.ts, and
 * trends.service.ts — trivial, but genuinely duplicated, and directly
 * adjacent to computeCycleLengths above, so it lives here rather than
 * as a fourth independent copy. */
export function averageCycleLengthDays(intervals: CycleLengthInterval[]): number | null {
  if (intervals.length === 0) return null;
  const sum = intervals.reduce((total, interval) => total + interval.days, 0);
  return Math.round(sum / intervals.length);
}
