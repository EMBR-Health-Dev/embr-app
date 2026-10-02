import { addDaysToIsoDate, localDate } from "../trends/symptom-history.js";

/**
 * Date rules for the daily check in, kept pure so the timezone
 * boundaries are unit-testable. A check in belongs to the person's own
 * local calendar date, fixed when they open it: saving or editing it
 * after midnight must not move it to the next day.
 */

/** A check in can be saved for today or the day before (an edit that crosses midnight). */
export const CHECK_IN_EDITABLE_DAYS = 2;

export type CheckInDateCheck = "ok" | "future" | "too_old";

export function checkInDateStatus(date: string, timeZone: string, now: Date): CheckInDateCheck {
  const today = localDate(now, timeZone);
  if (date > today) return "future";
  if (date < addDaysToIsoDate(today, -(CHECK_IN_EDITABLE_DAYS - 1))) return "too_old";
  return "ok";
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** 12:00 local time on `date` in `timeZone`, as an instant. */
export function localNoon(date: string, timeZone: string): Date {
  const guess = new Date(`${date}T12:00:00Z`);
  return new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
}

/**
 * When a symptom newly added to a check in is recorded as occurring:
 * now, for today's check in; local noon of that date for the previous
 * day's (so it stays inside that day in every view that groups by day).
 * Symptoms already in the check in keep their original time.
 */
export function checkInOccurredAt(date: string, timeZone: string, now: Date): Date {
  return localDate(now, timeZone) === date ? now : localNoon(date, timeZone);
}

/** A YYYY-MM-DD as the value Prisma stores in a DATE column. */
export function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
