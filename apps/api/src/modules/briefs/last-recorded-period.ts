import type { LastRecordedPeriodDto } from "@embr/types";

/**
 * Whole calendar months from one YYYY-MM-DD date to a later one: a
 * month counts once the same day of the month is reached. 0 means less
 * than a month.
 */
export function wholeMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/**
 * The most recent day with period flow logged up to the end of the
 * brief, and how many whole months before that end it was. Looked up
 * across the whole record, not only the brief's range: a clinician
 * reading the brief cannot otherwise tell how long ago the last period
 * was, and that interval matters more in this transition than age does.
 *
 * A fact about the record, not about the body: a gap may mean periods
 * stopped or simply that they were not logged, so nothing here labels
 * a stage. Shown only in the person's own BRIEF; never sent to the AI.
 */
export function summarizeLastRecordedPeriod(
  lastPeriodDay: string | null,
  briefEndDay: string,
): LastRecordedPeriodDto {
  if (lastPeriodDay === null) return { date: null, monthsBeforeBriefEnd: null };
  return {
    date: lastPeriodDay,
    monthsBeforeBriefEnd: wholeMonthsBetween(lastPeriodDay, briefEndDay),
  };
}
