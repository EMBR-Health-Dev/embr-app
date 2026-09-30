const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * The calendar dates a brief covers, as the person picked them.
 *
 * The web client sends local-day boundaries (date-format.ts's
 * startOfLocalDay/endOfLocalDay): local 00:00 for `fromDate` and local
 * 23:59:59.999 for `toDate`, as UTC instants. Slicing those instants'
 * UTC date labels one end of the period with the wrong day for anyone
 * outside UTC (a Tokyo user picking Sep 1 to Sep 30 was shown
 * "2026-08-31"; a New York user, an end date of "2026-10-01").
 *
 * Shifting the start forward and an end-of-day end back by 12 hours
 * lands inside the picked local day for every offset from UTC-12 to
 * UTC+12, and leaves plain dates (UTC midnight, as direct API callers
 * and the tests send) on their own date. Offsets beyond +12 (e.g. New
 * Zealand daylight time) can still be labelled one day early; the data
 * included is unaffected either way, since this only builds labels.
 */
export function briefPeriodLabel(
  fromDate: Date,
  toDate: Date,
): { fromDate: string; toDate: string } {
  const isEndOfDayMarker = toDate.getUTCSeconds() === 59 && toDate.getUTCMilliseconds() === 999;
  const toLabelInstant = isEndOfDayMarker ? new Date(toDate.getTime() - TWELVE_HOURS_MS) : toDate;
  return {
    fromDate: new Date(fromDate.getTime() + TWELVE_HOURS_MS).toISOString().slice(0, 10),
    toDate: toLabelInstant.toISOString().slice(0, 10),
  };
}
