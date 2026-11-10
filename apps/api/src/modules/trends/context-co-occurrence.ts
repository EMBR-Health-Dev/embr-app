import type {
  ContextFactor,
  ExerciseLevel,
  SleepDurationBucket,
  StressLevel,
  SymptomCategory,
  SymptomContextCoOccurrenceDto,
} from "@embr/types";
import { MIN_CO_OCCURRENCE_DAYS } from "./co-occurrence.js";
import { localDate } from "./symptom-history.js";

export interface ContextLogRow {
  date: Date;
  sleepDuration: SleepDurationBucket | null;
  caffeineAfternoon: boolean | null;
  alcohol: boolean | null;
  stressLevel: StressLevel | null;
  exercise: ExerciseLevel | null;
}

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — the same discipline as
 * detectSymptomCoOccurrence, extended to a symptom category and a
 * context factor instead of two symptom categories. Exactly one
 * deterministic, versioned rule per factor decides whether a given
 * day "counts" as that factor — nothing here infers, buckets, or
 * interprets beyond this fixed mapping:
 *
 * - SHORT_SLEEP: sleepDuration === "UNDER_6H"
 * - CAFFEINE_AFTERNOON: caffeineAfternoon === true
 * - ALCOHOL: alcohol === true
 * - HIGH_STRESS: stressLevel === "HIGH"
 * - VIGOROUS_EXERCISE: exercise === "VIGOROUS". Only the hardest
 *   level counts: lighter exercise is on most days for many people,
 *   so it would line up with almost any symptom and say nothing.
 *
 * Like its symptom-symptom counterpart, this function knows nothing
 * about what a co-occurrence *means* — it only counts calendar days on
 * which a symptom category and a context factor were both reported.
 * It reports "N days recorded together," never "the factor caused or
 * triggered the symptom" — that distinction is enforced at the
 * language layer in the DTO's consumers (see co-occurrence-card.tsx's
 * "recorded together"/"appeared alongside" copy for the symptom-
 * symptom case, which this feature's copy must match), not here, but
 * this function's own output shape (days + dates, no verdict) is what
 * makes that enforcement possible.
 *
 * Given the same input arrays, always returns the same output,
 * regardless of row order.
 */
/** The one rule per factor listed above, shared with next-day-context.ts. */
export function qualifyingFactors(log: ContextLogRow): ContextFactor[] {
  const factors: ContextFactor[] = [];
  if (log.sleepDuration === "UNDER_6H") factors.push("SHORT_SLEEP");
  if (log.caffeineAfternoon === true) factors.push("CAFFEINE_AFTERNOON");
  if (log.alcohol === true) factors.push("ALCOHOL");
  if (log.stressLevel === "HIGH") factors.push("HIGH_STRESS");
  if (log.exercise === "VIGOROUS") factors.push("VIGOROUS_EXERCISE");
  return factors;
}

/** Whether she answered the question behind a factor that day at all.
 * An unanswered question is not the same as "no": a day only counts
 * as "without" a factor when she gave a different answer. */
export function factorAnswered(log: ContextLogRow, factor: ContextFactor): boolean {
  switch (factor) {
    case "SHORT_SLEEP":
      return log.sleepDuration !== null;
    case "CAFFEINE_AFTERNOON":
      return log.caffeineAfternoon !== null;
    case "ALCOHOL":
      return log.alcohol !== null;
    case "HIGH_STRESS":
      return log.stressLevel !== null;
    case "VIGOROUS_EXERCISE":
      return log.exercise !== null;
  }
}

export function detectSymptomContextCoOccurrence(
  symptomLogs: Array<{ category: SymptomCategory; occurredAt: Date }>,
  contextLogs: ContextLogRow[],
  timeZone = "UTC",
): SymptomContextCoOccurrenceDto | null {
  // Symptom entries are instants, counted on her local day so they line
  // up with context answers, which are stored against that local date.
  const datesByCategory = new Map<SymptomCategory, Set<string>>();
  for (const log of symptomLogs) {
    const dateKey = localDate(log.occurredAt, timeZone);
    let dates = datesByCategory.get(log.category);
    if (!dates) {
      dates = new Set();
      datesByCategory.set(log.category, dates);
    }
    dates.add(dateKey);
  }

  const datesByFactor = new Map<ContextFactor, Set<string>>();
  for (const log of contextLogs) {
    const dateKey = log.date.toISOString().slice(0, 10);
    for (const factor of qualifyingFactors(log)) {
      let dates = datesByFactor.get(factor);
      if (!dates) {
        dates = new Set();
        datesByFactor.set(factor, dates);
      }
      dates.add(dateKey);
    }
  }

  // Fixed, alphabetical iteration order on both axes — same
  // determinism reasoning as detectSymptomCoOccurrence: the first pair
  // encountered at the maximum overlap is, by construction, the
  // alphabetically-first one, so "only replace on strictly greater
  // count" is sufficient without a separate tie-break comparison.
  const categories = [...datesByCategory.keys()].sort();
  const factors = [...datesByFactor.keys()].sort();

  let best: SymptomContextCoOccurrenceDto | null = null;

  for (const category of categories) {
    const symptomDates = datesByCategory.get(category)!;

    for (const factor of factors) {
      const factorDates = datesByFactor.get(factor)!;

      const overlapDates: string[] = [];
      for (const date of symptomDates) {
        if (factorDates.has(date)) overlapDates.push(date);
      }

      if (
        overlapDates.length >= MIN_CO_OCCURRENCE_DAYS &&
        (!best || overlapDates.length > best.days)
      ) {
        best = {
          category,
          factor,
          days: overlapDates.length,
          dates: overlapDates.sort(),
        };
      }
    }
  }

  return best;
}
