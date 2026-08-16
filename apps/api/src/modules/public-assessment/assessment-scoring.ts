import type { PerimenopauseAssessmentResultDto } from "@embr/types";
import type { PerimenopauseAssessmentInput } from "@embr/validation";

/** Below this, the response reads as "you may want to keep an eye on
 * this" (low tier); at or above, "this is worth a conversation with a
 * specialist" (high tier). The same threshold-of-3 used for the
 * co-occurrence pattern engine (MIN_CO_OCCURRENCE_DAYS) — reused
 * deliberately for consistency, not re-derived from scratch. */
export const ASSESSMENT_HIGH_TIER_THRESHOLD = 3;

/**
 * Purely descriptive counting — no weighting, no model, no ML, and
 * nothing resembling a clinical scoring instrument. This function
 * knows nothing about what a given count of symptoms *means*
 * medically; it only counts how many of a fixed checklist were
 * selected. It never returns anything resembling a diagnosis, a
 * probability, or a confidence value — see the doc comment on
 * PerimenopauseAssessmentResultDto for what the result is and isn't.
 *
 * Deduplicates defensively — the same category submitted twice (a
 * client bug, or a tampered request) counts once, matching how a real
 * symptom checklist actually works: you either checked "Hot Flash" or
 * you didn't.
 */
export function scorePerimenopauseAssessment(
  input: PerimenopauseAssessmentInput,
): PerimenopauseAssessmentResultDto {
  const uniqueSymptomCount = new Set(input.symptoms).size;
  const score = uniqueSymptomCount + (input.hasIrregularPeriods ? 1 : 0);
  const tier = score >= ASSESSMENT_HIGH_TIER_THRESHOLD ? "high" : "low";
  return { score, tier };
}
