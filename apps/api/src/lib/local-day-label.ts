const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/*
 * Calendar-date labels for a range whose ends are local-day boundaries.
 *
 * The web client sends ranges as UTC instants of local 00:00 (start)
 * and local 23:59:59.999 (end) — see apps/web's date-format.ts
 * startOfLocalDay/endOfLocalDay. Slicing those instants' UTC date labels
 * one end with the wrong day for anyone outside UTC (a Tokyo user
 * picking Sep 1 was shown "2026-08-31"; a New York user's Sep 30 end,
 * "2026-10-01").
 *
 * Shifting the start forward, and an end-of-day end back, by 12 hours
 * lands inside the picked local day for every offset from UTC-12 to
 * UTC+12, and leaves plain dates (UTC midnight, as direct API callers
 * and tests send) on their own date. Offsets beyond +12 (e.g. New
 * Zealand daylight time) can still be labelled one day early. Labels
 * only: which data a range includes is unaffected.
 */

export function localDayStartLabel(date: Date): string {
  return new Date(date.getTime() + TWELVE_HOURS_MS).toISOString().slice(0, 10);
}

export function localDayEndLabel(date: Date): string {
  const isEndOfDayMarker = date.getUTCSeconds() === 59 && date.getUTCMilliseconds() === 999;
  const instant = isEndOfDayMarker ? new Date(date.getTime() - TWELVE_HOURS_MS) : date;
  return instant.toISOString().slice(0, 10);
}
