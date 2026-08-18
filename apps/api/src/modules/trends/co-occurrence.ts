import type { SymptomCategory, SymptomCoOccurrenceDto } from "@embr/types";

/** Below this, two categories sharing a handful of days is noise, not
 * a pattern worth surfacing — the exact number the-loop's own
 * onboarding preview text uses ("...appeared alongside... on 6
 * days"), chosen as a floor rather than a target. */
export const MIN_CO_OCCURRENCE_DAYS = 3;

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine) — deterministic pattern
 * detection over normalized symptom data, nothing more. This function
 * knows nothing about what a co-occurrence *means*; it only counts
 * calendar days on which two symptom categories were both logged.
 * Interpretation (Stage 4) and AI narration (Stage 5) do not exist for
 * this feature yet, deliberately — see Sprint 3's report.
 *
 * Given the same input array, always returns the same output,
 * regardless of row order — required for the result to be reproducible
 * across requests, not an incidental nice-to-have.
 */
export function detectSymptomCoOccurrence(
  logs: Array<{ category: SymptomCategory; occurredAt: Date }>,
): SymptomCoOccurrenceDto | null {
  // Calendar dates, not timestamps — two logs for the same category on
  // the same day must count as one occurrence of that day, not two,
  // and two logs of different categories at different times on the
  // same day must still count as "both happened that day." UTC-based
  // (date.toISOString().slice(0, 10)), matching this exact module's
  // own established convention in cycleLength's toIsoDate — not a new
  // timezone policy introduced for this feature specifically.
  const datesByCategory = new Map<SymptomCategory, Set<string>>();
  for (const log of logs) {
    const dateKey = log.occurredAt.toISOString().slice(0, 10);
    let dates = datesByCategory.get(log.category);
    if (!dates) {
      dates = new Set();
      datesByCategory.set(log.category, dates);
    }
    dates.add(dateKey);
  }

  // Sorted once, up front — the double loop below then visits every
  // category pair in a single, fixed, alphabetical order every time,
  // which is what makes the tie-break deterministic without needing
  // any separate tie-break comparison: the first pair encountered at
  // the maximum overlap is, by construction, the alphabetically-first
  // one, so "only replace on a strictly greater count" is sufficient.
  const categories = [...datesByCategory.keys()].sort();

  let best: SymptomCoOccurrenceDto | null = null;

  for (let i = 0; i < categories.length; i++) {
    const categoryA = categories[i]!;
    const datesA = datesByCategory.get(categoryA)!;

    for (let j = i + 1; j < categories.length; j++) {
      const categoryB = categories[j]!;
      const datesB = datesByCategory.get(categoryB)!;

      let overlap = 0;
      for (const date of datesA) {
        if (datesB.has(date)) overlap++;
      }

      if (overlap >= MIN_CO_OCCURRENCE_DAYS && (!best || overlap > best.days)) {
        best = { categoryA, categoryB, days: overlap };
      }
    }
  }

  return best;
}
