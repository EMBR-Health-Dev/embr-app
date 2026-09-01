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
