import type { EvidenceStrength } from "@embr/types";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine) — a plain, deterministic bucketing of how many
 * distinct calendar days exist in a person's record, nothing more. This
 * says nothing about symptom severity, pattern confidence, or clinical
 * significance; it's a fact about the record's size, used to set
 * expectations about how much a Patterns or Clinical Brief view can
 * responsibly show yet.
 *
 * Thresholds are anchored to existing, already-shipped copy and windows
 * rather than invented here: EARLY_TO_EMERGING_DAYS (14) matches
 * onboarding's own "After you've logged for a couple of weeks..."
 * framing (Onboarding.theLoop.patternsTitle in apps/web/messages/en.json);
 * EMERGING_TO_ESTABLISHED_DAYS (45) is half of the standard 90-day
 * trends window already used throughout (Patterns, Timeline, and the
 * Clinical Brief's default range).
 */
export const EARLY_TO_EMERGING_DAYS = 14;
export const EMERGING_TO_ESTABLISHED_DAYS = 45;

export function computeEvidenceStrength(distinctDaysLogged: number): EvidenceStrength {
  if (distinctDaysLogged >= EMERGING_TO_ESTABLISHED_DAYS) return "ESTABLISHED";
  if (distinctDaysLogged >= EARLY_TO_EMERGING_DAYS) return "EMERGING";
  return "EARLY";
}
