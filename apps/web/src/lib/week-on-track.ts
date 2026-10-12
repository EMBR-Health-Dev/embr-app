import { toIsoDate } from "./date-format";

/** What she recorded on one day, from her own entries only. */
export interface DayRecord {
  /** Local YYYY-MM-DD. */
  date: string;
  symptoms: boolean;
  context: boolean;
  cycle: boolean;
}

export type TodayStepKey = "symptoms" | "context" | "cycle" | "brief";

export interface TodayStep {
  key: TodayStepKey;
  done: boolean;
  /** Optional steps are only for days something happened (bleeding). */
  optional: boolean;
}

export const WEEK_DAYS = 7;
/** A BRIEF made this recently counts as ready for an upcoming appointment. */
export const RECENT_BRIEF_DAYS = 14;

/** The last seven local days, oldest first, ending today. */
export function lastSevenDates(today: Date = new Date()): string[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (WEEK_DAYS - 1 - i));
    return toIsoDate(d);
  });
}

/**
 * One row per day for the week strip. Symptom times are converted to
 * her local date; cycle and context entries are already date-only.
 */
export function buildWeek(
  dates: string[],
  symptomTimes: string[],
  contextDates: string[],
  cycleDates: string[],
): DayRecord[] {
  const symptomDays = new Set(symptomTimes.map((t) => toIsoDate(new Date(t))));
  const contextDays = new Set(contextDates);
  const cycleDays = new Set(cycleDates);
  return dates.map((date) => ({
    date,
    symptoms: symptomDays.has(date),
    context: contextDays.has(date),
    cycle: cycleDays.has(date),
  }));
}

/** Days in the week with at least one entry of any kind. */
export function daysWithEntries(week: DayRecord[]): number {
  return week.filter((d) => d.symptoms || d.context || d.cycle).length;
}

/**
 * Today's short list, in the order she would do it. Purely about
 * keeping her record complete: nothing here is health advice. The BRIEF
 * step appears only when she said an appointment is within a month.
 */
export function todaySteps(input: {
  today: DayRecord;
  appointmentSoon: boolean;
  latestBriefCreatedAt: string | null;
  now?: Date;
}): TodayStep[] {
  const steps: TodayStep[] = [
    { key: "symptoms", done: input.today.symptoms, optional: false },
    { key: "context", done: input.today.context, optional: false },
    { key: "cycle", done: input.today.cycle, optional: true },
  ];
  if (input.appointmentSoon) {
    const now = input.now ?? new Date();
    const recent =
      input.latestBriefCreatedAt !== null &&
      now.getTime() - new Date(input.latestBriefCreatedAt).getTime() <=
        RECENT_BRIEF_DAYS * 86_400_000;
    steps.push({ key: "brief", done: recent, optional: false });
  }
  return steps;
}
