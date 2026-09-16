/** Formats a Date as a local calendar date (YYYY-MM-DD), not UTC.
 *
 * date.toISOString() would shift the date itself near midnight in
 * timezones behind UTC — 11pm local on the 5th becomes the 6th in
 * UTC — silently sending the wrong day to the API for exactly the
 * people this bug is easiest to miss for (anyone picking a date
 * later in their own evening).
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The ISO instant for local midnight at the start of the given date's
 * calendar day. Used wherever a picked date needs to become a precise
 * instant for the API's from/to range filters (brief generation) —
 * mirrors apps/web/src/lib/date-format.ts's identical helper, taking
 * a Date directly since the native date picker already hands back a
 * real Date rather than a bare "YYYY-MM-DD" string.
 */
export function startOfLocalDay(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
}

/**
 * The end-of-day counterpart to startOfLocalDay — local 23:59:59.999
 * on the given date, not local midnight. Without this, a range's `to`
 * would exclude nearly the entire final day: the API's from/to
 * filters are instant comparisons, and "to = today" has to mean
 * "through the end of today."
 */
export function endOfLocalDay(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).toISOString();
}
