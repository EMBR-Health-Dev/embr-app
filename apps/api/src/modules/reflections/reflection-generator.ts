import type { ReflectionDto, SymptomCategory } from "@embr/types";

/** Below this, a single logged day isn't really a "streak" worth
 * calling out — the same floor-not-target reasoning as
 * MIN_CO_OCCURRENCE_DAYS in co-occurrence.ts. */
export const MIN_STREAK_DAYS = 2;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoDateMinusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return toIsoDate(d);
}

/**
 * Consecutive-day streak ending at `todayIso` or, if nothing was
 * logged yet today, at the day before — so a user checking in before
 * logging anything today still sees their streak from prior days
 * rather than it appearing to have already reset. Walks backward one
 * calendar day at a time until the first gap; deterministic given the
 * same date set and "today," with no reliance on array order.
 */
export function computeLoggingStreakDays(loggedDates: Set<string>, todayIso: string): number {
  let cursor = todayIso;
  if (!loggedDates.has(cursor)) {
    cursor = isoDateMinusDays(cursor, 1);
    if (!loggedDates.has(cursor)) return 0;
  }

  let streak = 0;
  while (loggedDates.has(cursor)) {
    streak++;
    cursor = isoDateMinusDays(cursor, 1);
  }
  return streak;
}

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — same as
 * detectSymptomCoOccurrence: deterministic pattern detection over
 * normalized symptom data, nothing more. These are engagement/
 * awareness observations, not clinical claims — "you logged 3 things
 * this week" carries no diagnostic weight, which is exactly why no
 * evidence-based-interpretation or AI-narration stage exists for
 * reflections; there is nothing here for Stage 4/5 to add.
 *
 * Given the same inputs, always returns the same output in the same
 * order (weekly_frequency before logging_streak) — required for the
 * result to be reproducible across requests and for client-side
 * dismissal-by-id to behave predictably.
 */
export function generateReflections(input: {
  weeklySymptomLogs: Array<{ category: SymptomCategory; occurredAt: Date }>;
  loggedDates: Set<string>;
  now: Date;
}): ReflectionDto[] {
  const todayIso = toIsoDate(input.now);
  const reflections: ReflectionDto[] = [];

  if (input.weeklySymptomLogs.length > 0) {
    const countsByCategory = new Map<SymptomCategory, number>();
    for (const log of input.weeklySymptomLogs) {
      countsByCategory.set(log.category, (countsByCategory.get(log.category) ?? 0) + 1);
    }
    // Sorted by count descending, category name ascending as the
    // deterministic tie-break — same reasoning as co-occurrence.ts's
    // alphabetical-first-encountered convention, made explicit here
    // via a real sort rather than relying on Map insertion order.
    const [topCategory] = [...countsByCategory.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]!;

    reflections.push({
      id: `weekly_frequency:${todayIso}`,
      type: "weekly_frequency",
      totalCount: input.weeklySymptomLogs.length,
      topCategory,
    });
  }

  const streakDays = computeLoggingStreakDays(input.loggedDates, todayIso);
  if (streakDays >= MIN_STREAK_DAYS) {
    const streakEndIso = input.loggedDates.has(todayIso) ? todayIso : isoDateMinusDays(todayIso, 1);
    reflections.push({
      id: `logging_streak:${streakEndIso}`,
      type: "logging_streak",
      days: streakDays,
    });
  }

  return reflections;
}
