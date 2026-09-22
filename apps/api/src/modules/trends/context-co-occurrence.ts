import type {
  ContextFactor,
  SleepDurationBucket,
  StressLevel,
  SymptomCategory,
  SymptomContextCoOccurrenceDto,
} from "@embr/types";
import { MIN_CO_OCCURRENCE_DAYS } from "./co-occurrence.js";

export interface ContextLogRow {
  date: Date;
  sleepDuration: SleepDurationBucket | null;
  caffeineAfternoon: boolean | null;
  alcohol: boolean | null;
  stressLevel: StressLevel | null;
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
export function detectSymptomContextCoOccurrence(
  symptomLogs: Array<{ category: SymptomCategory; occurredAt: Date }>,
  contextLogs: ContextLogRow[],
): SymptomContextCoOccurrenceDto | null {
  const datesByCategory = new Map<SymptomCategory, Set<string>>();
  for (const log of symptomLogs) {
    const dateKey = log.occurredAt.toISOString().slice(0, 10);
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
    const qualifyingFactors: ContextFactor[] = [];
    if (log.sleepDuration === "UNDER_6H") qualifyingFactors.push("SHORT_SLEEP");
    if (log.caffeineAfternoon === true) qualifyingFactors.push("CAFFEINE_AFTERNOON");
    if (log.alcohol === true) qualifyingFactors.push("ALCOHOL");
    if (log.stressLevel === "HIGH") qualifyingFactors.push("HIGH_STRESS");

    for (const factor of qualifyingFactors) {
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
