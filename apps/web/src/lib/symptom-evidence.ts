import type {
  SeverityLevel,
  SymptomCategory,
  SymptomHistoryCategoryDto,
  SymptomHistoryDto,
} from "@embr/types";

/**
 * The view layer over GET /trends/symptom-history. Every figure comes
 * from the API; this module only names the states the UI must keep
 * apart, so none of them is ever collapsed into a "has symptom" flag.
 *
 * Day level:
 *   logged    an entry exists for that symptom on that day (with severity)
 *   no_entry  nothing was recorded; this is NOT "symptom absent"
 *
 * Symptom level:
 *   no_history           never logged
 *   logged_recently      at least one entry in the last 7 days
 *   not_logged_recently  the API's 21 day rule is triggered
 *   logged_earlier       has history, none in the last 7 days, rule not triggered
 */
export type DayEvidence =
  | { state: "logged"; date: string; maxSeverity: SeverityLevel; entries: number }
  | { state: "no_entry"; date: string };

export type SymptomRecordState =
  "no_history" | "logged_recently" | "not_logged_recently" | "logged_earlier";

export const RECENT_WINDOW_DAYS = 7;
export const FREQUENCY_WINDOW_DAYS = 42;

export function findCategory(
  history: SymptomHistoryDto | null,
  category: SymptomCategory,
): SymptomHistoryCategoryDto | undefined {
  return history?.categories.find((c) => c.category === category);
}

export function symptomRecordState(
  category: SymptomHistoryCategoryDto | undefined,
): SymptomRecordState {
  if (!category || category.totalDaysLogged === 0) return "no_history";
  if (category.notLoggedRecently) return "not_logged_recently";
  if (category.daysLoggedLast7 > 0) return "logged_recently";
  return "logged_earlier";
}

export function dayEvidence(
  category: SymptomHistoryCategoryDto | undefined,
  date: string,
): DayEvidence {
  const day = category?.days.find((d) => d.date === date);
  return day
    ? { state: "logged", date, maxSeverity: day.maxSeverity, entries: day.entries }
    : { state: "no_entry", date };
}

/** The person's own IANA time zone, so days match the calendar they live in. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface CalendarCell {
  date: string;
  /** Outside the requested range (or in the future): shown, never interpreted. */
  inRange: boolean;
}

export interface CalendarMonth {
  /** YYYY-MM */
  month: string;
  /** Monday-first weeks; null pads the first and last week. */
  weeks: Array<Array<CalendarCell | null>>;
}

/** Months covering [from, to], newest first, as Monday-first weeks. */
export function calendarMonths(from: string, to: string): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  let cursor = `${to.slice(0, 7)}-01`;
  const firstMonth = from.slice(0, 7);
  while (cursor.slice(0, 7) >= firstMonth) {
    const month = cursor.slice(0, 7);
    const weekday = (new Date(`${cursor}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const cells: Array<CalendarCell | null> = Array.from({ length: weekday }, () => null);
    for (let date = cursor; date.slice(0, 7) === month; date = addDays(date, 1)) {
      cells.push({ date, inRange: date >= from && date <= to });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<CalendarCell | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ month, weeks });
    cursor = `${addDays(cursor, -1).slice(0, 7)}-01`;
  }
  return months;
}
