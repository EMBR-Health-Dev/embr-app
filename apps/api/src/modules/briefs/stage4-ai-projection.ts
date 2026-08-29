import type { BriefTreatmentImpactEntryDto } from "@embr/types";
import type { Stage4Pattern, Stage4Result } from "./stage4-interpretation.js";

/**
 * The privacy boundary between the canonical Stage 4 result (safe to
 * persist and render — see stage4-interpretation.ts) and what
 * actually reaches briefAi.generate(). buildTreatmentWindowPattern's
 * `observation` embeds the treatment's *name* ("Estradiol patch — 0
 * symptom logs...") — a reasonable choice for UI/PDF rendering, which
 * already had a self-contained-snapshot precedent
 * (BriefTreatmentSummaryEntryDto), but never an approved one for what
 * reaches the model: the existing, repeatedly-reaffirmed invariant is
 * that treatment data and free-text notes are not sent to the AI
 * unless explicitly approved otherwise. A treatment name is exactly
 * the kind of free text a person chose to enter and can be
 * identifying/sensitive in a way a plain category or a count is not.
 *
 * This module never touches buildTreatmentWindowPattern or the
 * canonical Stage4Result — that remains the one source of truth for
 * everything persisted and rendered. It only builds a second,
 * AI-facing copy with treatment names stripped, from the same
 * structured before/after evidence treatment-impact.ts already
 * computed — never by parsing or redacting the canonical
 * `observation` string, which would be exactly the kind of regex-
 * based text surgery this codebase has avoided everywhere else.
 *
 * evidenceRef.treatmentId is deliberately left unchanged for
 * treatment_window_changed patterns, not stripped: it's an opaque
 * backend identifier, not human-readable free text — reading it
 * reveals nothing about what the treatment is, unlike the name — and
 * it's already unavoidably embedded in the pattern's own `id` (e.g.
 * "treatment_window_changed:treatment-abc"), so removing it from
 * evidenceRef specifically wouldn't reduce what the model can infer.
 * Keeping it unchanged also means validateStage4Patterns needs no
 * special-casing: the evidenceRef the AI receives and echoes back is
 * identical to the canonical one, so comparing a returned pattern
 * against the canonical set (stage4-validation.ts) is already
 * comparing against exactly what was sent.
 */
export function buildAiSafeStage4Interpretation(
  interpretation: Stage4Result,
  treatmentImpact: BriefTreatmentImpactEntryDto[],
): Stage4Result {
  const treatmentImpactById = new Map(treatmentImpact.map((entry) => [entry.treatmentId, entry]));

  return {
    interpretationVersion: interpretation.interpretationVersion,
    patterns: interpretation.patterns.map((pattern) =>
      pattern.type === "treatment_window_changed"
        ? projectTreatmentPattern(pattern, treatmentImpactById)
        : pattern,
    ),
  };
}

function projectTreatmentPattern(
  pattern: Stage4Pattern,
  treatmentImpactById: Map<string, BriefTreatmentImpactEntryDto>,
): Stage4Pattern {
  // evidenceRef is guaranteed to be the {treatmentId} shape here —
  // buildTreatmentWindowPattern is the only producer of
  // treatment_window_changed patterns and always builds it that way.
  const { treatmentId } = pattern.evidenceRef as { treatmentId: string };
  const entry = treatmentImpactById.get(treatmentId);
  if (!entry) {
    // Should be unreachable: treatmentImpact is the exact array
    // buildStage4Interpretation used to construct this pattern in the
    // first place. Failing loudly here is deliberate — silently
    // falling back to the untouched (name-containing) pattern would
    // be exactly the privacy violation this module exists to prevent.
    throw new Error(
      `buildAiSafeStage4Interpretation: no treatmentImpact entry found for pattern "${pattern.id}"`,
    );
  }

  const { before, after } = entry;
  return {
    ...pattern,
    observation:
      `A treatment window showed ${before.logCount} symptom log${before.logCount === 1 ? "" : "s"}` +
      ` in the ${before.days} days before starting, compared with ${after.logCount} symptom` +
      ` log${after.logCount === 1 ? "" : "s"} in the ${after.days} days after starting.`,
  };
}
