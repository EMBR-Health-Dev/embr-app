import type { SymptomFrequencyComparisonEntry } from "./period-comparison.js";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — deterministic filtering over
 * already-computed frequency comparison, nothing more. This module
 * knows nothing about what ongoing presence *means* clinically; it
 * only checks two counts against a floor. Interpretation (Stage 4)
 * and any AI narration are explicitly out of scope, matching every
 * other Stage 3 function in this module (period-comparison.ts,
 * co-occurrence.ts, treatment-impact.ts).
 *
 * Deliberately takes SymptomFrequencyComparisonEntry[] — the output
 * shape compareSymptomFrequency already produces — rather than raw
 * symptom logs. No new query, no new aggregation: this is a pure
 * filter over data the brief has already computed for a different
 * purpose (frequencyComparison), reused here rather than counted a
 * second time.
 */

/** Below this many occurrences in the *current* period, a category
 * that also happened to appear once in the previous period is closer
 * to coincidence than to something ongoing — the same "floor, not a
 * target" reasoning MIN_CO_OCCURRENCE_DAYS and
 * MIN_TREATMENT_IMPACT_DAYS already establish elsewhere in this exact
 * module and its sibling treatments module, reused here rather than a
 * new, unrelated threshold invented for this feature specifically. */
export const MIN_PERSISTENT_COUNT = 3;

/**
 * A category counts as persistent when it was reported at all in the
 * previous period (previousCount > 0 — "appears in both periods") and
 * remains materially present now (currentCount >= MIN_PERSISTENT_COUNT
 * — "remains materially present," not just a single leftover log).
 * previousCount itself has no floor beyond "greater than zero": the
 * question this answers is "is this still going on," which only needs
 * the prior period to have registered the symptom at all, not to have
 * registered it heavily.
 *
 * Returns category strings only, in whatever order comparison already
 * arrived in (compareSymptomFrequency's own alphabetical, deterministic
 * ordering) — no separate sort, no ranking by magnitude, matching
 * compareSymptomFrequency's own reasoning for not ranking by change
 * size: the category taxonomy is a small, fixed set, and this function
 * has no principled basis for deciding one persistent category matters
 * more than another.
 */
export function detectPersistentSymptoms(comparison: SymptomFrequencyComparisonEntry[]): string[] {
  return comparison
    .filter((entry) => entry.previousCount > 0 && entry.currentCount >= MIN_PERSISTENT_COUNT)
    .map((entry) => entry.category);
}
