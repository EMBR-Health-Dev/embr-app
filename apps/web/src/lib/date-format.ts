/** Formats a Date as a local calendar date (YYYY-MM-DD), not UTC.
 *
 * date.toISOString() would shift the date itself near midnight in
 * timezones behind UTC — 11pm local on the 5th becomes the 6th in
 * UTC — silently sending the wrong day to the API for exactly the
 * people this bug is easiest to miss for (anyone picking a date
 * later in their own evening). The same shift runs the other way for
 * timezones ahead of UTC (JST, UTC+9 — a real, not hypothetical,
 * population for this app, given its bilingual EN/JA product
 * surface): UTC's calendar date lags behind the user's own local date
 * for several hours after midnight, so a UTC-based "today" can be
 * wrong in the other direction too — a date input's `max` set to a
 * UTC-computed today could reject a JST user's own actual today.
 *
 * Mirrors apps/mobile/lib/date-format.ts's identical toIsoDate
 * exactly — this app's cycle-entry quick-log (dashboard) and
 * treatment start/end dates all depend on this behaving the same way
 * on both platforms.
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts a `<input type="date">` value ("YYYY-MM-DD") into the ISO
 * instant for local midnight at the start of that day.
 *
 * `new Date(dateStr)` on a bare date-only string is parsed as UTC
 * midnight (per the ECMA-262 date-only-string rule), not local
 * midnight — the opposite bug from the one toIsoDate's own comment
 * above describes, but with a worse consequence here: appending a
 * bare time component (no "Z"/offset suffix) makes the Date
 * constructor parse it as local time instead, which is what a picked
 * calendar date actually means. Used wherever a range's `from` needs
 * to become a precise instant for the API (brief generation, export).
 */
export function startOfLocalDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

/**
 * The end-of-day counterpart to startOfLocalDay — local 23:59:59.999
 * on the given date, not UTC midnight. Without this, a range's `to`
 * sent as a bare date string (or as local midnight) would exclude
 * nearly the entire final day: the API's from/to filters are instant
 * comparisons, and "to = today" has to mean "through the end of
 * today," not "up to the first instant of today."
 */
export function endOfLocalDay(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}
