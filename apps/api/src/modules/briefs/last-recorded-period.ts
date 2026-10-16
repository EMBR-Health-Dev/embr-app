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
 * Her last period up to the end of the brief, and how many whole months
 * before that end it was. Two sources: the most recent day with period
 * flow logged anywhere in the record, and the date she gave in Settings
 * (for a last period before she used EMBR). The later of the two is
 * used, and the BRIEF says which; on the same day, the logged day wins.
 * A reported date after the brief's end is ignored, like a later log.
 *
 * A clinician reading the brief cannot otherwise tell how long ago the
 * last period was, and that interval matters more in this transition
 * than age does. A fact about the record, not about the body: nothing
 * here labels a stage. Shown only in the person's own BRIEF; never sent
 * to the AI.
 */
export function summarizeLastRecordedPeriod(
  lastLoggedDay: string | null,
  reportedDate: string | null,
  briefEndDay: string,
): LastRecordedPeriodDto {
  const reported = reportedDate !== null && reportedDate <= briefEndDay ? reportedDate : null;
  if (lastLoggedDay === null && reported === null) {
    return { date: null, monthsBeforeBriefEnd: null };
  }
  const useReported = reported !== null && (lastLoggedDay === null || reported > lastLoggedDay);
  const date = useReported ? reported : lastLoggedDay!;
  return {
    date,
    monthsBeforeBriefEnd: wholeMonthsBetween(date, briefEndDay),
    source: useReported ? "reported" : "logged",
  };
}
