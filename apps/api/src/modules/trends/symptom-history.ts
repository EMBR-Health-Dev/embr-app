import type {
  SeverityLevel,
  SymptomCategory,
  SymptomHistoryCategoryDto,
  SymptomHistoryDto,
} from "@embr/types";

/**
 * Per-symptom history of what was recorded: first and last logged day,
 * how many days had an entry over fixed windows, and the days with an
 * entry in a range (for the calendar). Pure and deterministic: the same
 * logs, timezone and "now" always give the same result.
 *
 * Every figure is a count of entries or of days with at least one entry.
 * A day without an entry is never treated as "symptom absent" — it is
 * simply not in `days`. That distinction (no entry recorded vs. absent)
 * is the reason this module exists in this form; see SymptomHistoryDto.
 */

/** "Not logged recently" needs this many logged days before the gap... */
export const NOT_LOGGED_RECENTLY_MIN_DAYS = 3;
/** ...and no entry for this symptom in the last N days, today included. */
export const NOT_LOGGED_RECENTLY_GAP_DAYS = 21;

const SEVERITY_RANK: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

export interface HistoryLogInput {
  category: SymptomCategory;
  severity: SeverityLevel;
  occurredAt: Date;
}

/** YYYY-MM-DD of an instant in a given IANA timezone. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD shifted by whole days (calendar arithmetic, no timezone). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeSymptomHistory(params: {
  logs: HistoryLogInput[];
  timeZone: string;
  now: Date;
  /** YYYY-MM-DD, inclusive; defaults to 90 days before today. */
  rangeFrom?: string;
  /** YYYY-MM-DD, inclusive; defaults to today. */
  rangeTo?: string;
}): SymptomHistoryDto {
  const { logs, timeZone, now } = params;
  const today = localDate(now, timeZone);
  const rangeFrom = params.rangeFrom ?? addDaysToIsoDate(today, -89);
  const rangeTo = params.rangeTo ?? today;
  const last7From = addDaysToIsoDate(today, -6);
  const last42From = addDaysToIsoDate(today, -41);
  const gapFrom = addDaysToIsoDate(today, -(NOT_LOGGED_RECENTLY_GAP_DAYS - 1));

  interface Acc {
    entries: number;
    byDay: Map<string, { maxSeverity: SeverityLevel; entries: number }>;
  }
  const byCategory = new Map<SymptomCategory, Acc>();
  // Any symptom recorded in the gap window: without recent entries at
  // all, a quiet symptom says nothing (the person may simply have
  // stopped logging), so nothing is flagged.
  let anyEntryInGap = false;

  for (const log of logs) {
    const day = localDate(log.occurredAt, timeZone);
    if (day > today) continue; // future-dated entries are not history yet
    if (day >= gapFrom) anyEntryInGap = true;

    let acc = byCategory.get(log.category);
    if (!acc) {
      acc = { entries: 0, byDay: new Map() };
      byCategory.set(log.category, acc);
    }
    acc.entries += 1;
    const existing = acc.byDay.get(day);
    if (!existing) {
      acc.byDay.set(day, { maxSeverity: log.severity, entries: 1 });
    } else {
      existing.entries += 1;
      if (SEVERITY_RANK[log.severity] > SEVERITY_RANK[existing.maxSeverity]) {
        existing.maxSeverity = log.severity;
      }
    }
  }

  const categories: SymptomHistoryCategoryDto[] = [...byCategory.entries()].map(
    ([category, acc]) => {
      const dayKeys = [...acc.byDay.keys()].sort();
      const firstLoggedOn = dayKeys[0]!;
      const lastLoggedOn = dayKeys[dayKeys.length - 1]!;
      const inRange = dayKeys.filter((d) => d >= rangeFrom && d <= rangeTo);
      const rangeSeverityDays: Record<SeverityLevel, number> = { MILD: 0, MODERATE: 0, SEVERE: 0 };
      let rangeEntries = 0;
      for (const d of inRange) {
        const day = acc.byDay.get(d)!;
        rangeSeverityDays[day.maxSeverity] += 1;
        rangeEntries += day.entries;
      }
      const daysBeforeGap = dayKeys.filter((d) => d < gapFrom).length;

      return {
        category,
        firstLoggedOn,
        lastLoggedOn,
        totalEntries: acc.entries,
        totalDaysLogged: dayKeys.length,
        daysLoggedLast7: dayKeys.filter((d) => d >= last7From).length,
        daysLoggedLast42: dayKeys.filter((d) => d >= last42From).length,
        rangeEntries,
        rangeDaysLogged: inRange.length,
        rangeSeverityDays,
        notLoggedRecently:
          anyEntryInGap && lastLoggedOn < gapFrom && daysBeforeGap >= NOT_LOGGED_RECENTLY_MIN_DAYS,
        days: inRange.map((d) => ({ date: d, ...acc.byDay.get(d)! })),
      };
    },
  );

  // Most days logged in range first; ties by category id so the order is reproducible.
  categories.sort(
    (a, b) =>
      b.rangeDaysLogged - a.rangeDaysLogged ||
      b.totalDaysLogged - a.totalDaysLogged ||
      a.category.localeCompare(b.category),
  );

  return {
    timeZone,
    rangeFrom,
    rangeTo,
    today,
    rules: {
      notLoggedRecentlyGapDays: NOT_LOGGED_RECENTLY_GAP_DAYS,
      notLoggedRecentlyMinDays: NOT_LOGGED_RECENTLY_MIN_DAYS,
    },
    categories,
  };
}
