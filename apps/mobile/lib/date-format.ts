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
