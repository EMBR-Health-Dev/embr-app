import type { TreatmentDto } from "@embr/types";

const DAY_MS = 86_400_000;

function utc(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getTime();
}

/** Calendar days from start to end, both counted. */
export function spanDays(start: string, end: string): number {
  return Math.max(1, Math.round((utc(end) - utc(start)) / DAY_MS) + 1);
}

/**
 * How long a treatment ran (or has run so far), in the unit a person
 * would say it: days under two months, months under two years, then
 * years. Whole units only, rounded down.
 */
export function treatmentDuration(
  treatment: Pick<TreatmentDto, "startDate" | "endDate">,
  today: string,
): { unit: "days" | "months" | "years"; count: number } {
  const days = spanDays(treatment.startDate, treatment.endDate ?? today);
  if (days < 60) return { unit: "days", count: days };
  const months = Math.floor(days / 30.44);
  if (months < 24) return { unit: "months", count: months };
  return { unit: "years", count: Math.floor(months / 12) };
}

export interface TimelineAxis {
  /** YYYY-MM-DD, the first of a month. */
  start: string;
  end: string;
  /** Position (0 to 1) of a date along the axis. */
  at: (isoDate: string) => number;
  ticks: { date: string; label: "month" | "year" }[];
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * One axis for every treatment: from the first of the month of the
 * earliest start (at least three months back) to today. Ticks are
 * months, thinned to about six, or each January beyond 18 months.
 */
export function timelineAxis(starts: string[], today: string): TimelineAxis {
  const earliest = [...starts].sort()[0] ?? today;
  const threeMonthsBack = addMonths(today, -3);
  const start = addMonths(earliest < threeMonthsBack ? earliest : threeMonthsBack, 0);
  const total = utc(today) - utc(start) || DAY_MS;
  const at = (isoDate: string) => Math.min(1, Math.max(0, (utc(isoDate) - utc(start)) / total));

  const months: string[] = [];
  for (let m = start; m <= today; m = addMonths(m, 1)) months.push(m);
  let ticks: TimelineAxis["ticks"];
  if (months.length > 18) {
    ticks = months.filter((m) => m.slice(5, 7) === "01").map((date) => ({ date, label: "year" }));
  } else {
    const step = Math.ceil(months.length / 6);
    ticks = months
      .filter((_, i) => i % step === 0)
      .map((date) => ({ date, label: "month" as const }));
  }
  return { start, end: today, at, ticks };
}
