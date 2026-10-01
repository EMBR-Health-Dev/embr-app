import { localDayEndLabel, localDayStartLabel } from "../../lib/local-day-label.js";

/** The calendar dates a brief covers, as the person picked them — see
 * lib/local-day-label.ts for why these aren't plain UTC slices. */
export function briefPeriodLabel(
  fromDate: Date,
  toDate: Date,
): { fromDate: string; toDate: string } {
  return { fromDate: localDayStartLabel(fromDate), toDate: localDayEndLabel(toDate) };
}
