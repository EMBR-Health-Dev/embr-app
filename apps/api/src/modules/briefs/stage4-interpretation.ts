import type {
  BriefTreatmentImpactEntryDto,
  Stage4EvidenceRef,
  Stage4Pattern,
  Stage4PatternType,
  Stage4Result,
  SymptomCategory,
  SymptomCoOccurrenceDto,
} from "@embr/types";
import type { SymptomFrequencyComparisonEntry } from "./period-comparison.js";

/**
 * Stage 4 of EMBR's clinical logic pipeline (see the
 * embr-clinical-logic skill doctrine): a small, explicit, versioned
 * composition layer that maps already-qualified Stage 3 findings to
 * fixed interpretation text. Nothing here is AI-generated — every
 * observation/association/interpretation/caveat string is a template,
 * parameterized only by the evidence values themselves. Stage 5
 * (brief.ai.ts) narrates these fixed facts into prose; it does not
 * decide what they mean.
 *
 * IMPORTANT: Stage 4 interprets qualified deterministic evidence. It
 * does not redefine evidence qualification. frequencyComparison
 * already IS the qualified result of Stage 2/3's period-comparison
 * logic (see period-comparison.ts) — every entry it returns already
 * represents a real, computed count for both periods. This module
 * does not add a second, independent "is this change big enough"
 * threshold on top of that. It maps `direction` directly:
 * "increased" -> frequency_increased, "decreased" ->
 * frequency_decreased, with no additional floor. If that turns out to
 * produce too many low-value patterns in practice, that is an
 * explicit, independently justified decision for a later milestone —
 * not something to quietly invent here.
 *
 * The Stage4PatternType/Stage4EvidenceRef/Stage4Pattern/Stage4Result
 * *type definitions* live in @embr/types, not here — ClinicalBriefDto
 * needs to expose the canonical persisted interpretation to every
 * client, and @embr/types is the one place both the API and every
 * client already import shared shapes from (see TreatmentImpactDto
 * for the exact same precedent). Re-exported below so every existing
 * import of these types from this file keeps working unchanged; this
 * file remains the one place the actual pattern-building *logic*
 * lives.
 */
export type { Stage4PatternType, Stage4EvidenceRef, Stage4Pattern, Stage4Result };

export const INTERPRETATION_VERSION = "1.0";

/**
 * Deliberately only the three Stage 3 evidence shapes that map to one
 * of the four approved pattern types — not symptomSummary,
 * cycleSummary, treatmentSummary, or persistentSymptoms, none of
 * which have an approved pattern type in this milestone (see
 * persistentSymptoms' own test coverage below: it produces no Stage 4
 * pattern, on purpose, not because this input type happens to omit
 * it).
 */
export interface Stage4Input {
  frequencyComparison: SymptomFrequencyComparisonEntry[];
  coOccurrence: SymptomCoOccurrenceDto | null;
  treatmentImpact: BriefTreatmentImpactEntryDto[];
}

const FREQUENCY_CAVEAT =
  "This reflects self-reported logging frequency only. It does not indicate severity, cause, or clinical significance.";

const CO_OCCURRENCE_CAVEAT = "This is a temporal association only, not a causal relationship.";

const TREATMENT_WINDOW_CAVEAT =
  "This is an observed change over time, not evidence that the treatment caused it.";

/**
 * Deterministic by construction: a pure function of `type` and
 * `evidenceRef`, both of which are themselves deterministic outputs
 * of Stage 3 evidence (category is a fixed enum value; treatmentId is
 * a stable database identifier; the categoryA/categoryB pair is
 * already alphabetically ordered by detectSymptomCoOccurrence). The
 * `type` prefix makes collisions across pattern types structurally
 * impossible; within a type, distinctness follows from the
 * underlying evidence already being uniquely keyed (frequencyComparison
 * is built from a Map keyed by category — see period-comparison.ts —
 * and treatmentId is a primary key).
 */
function buildPatternId(type: Stage4PatternType, evidenceRef: Stage4EvidenceRef): string {
  if ("category" in evidenceRef) {
    return `${type}:${evidenceRef.category}`;
  }
  if ("categoryA" in evidenceRef) {
    return `${type}:${evidenceRef.categoryA}:${evidenceRef.categoryB}`;
  }
  return `${type}:${evidenceRef.treatmentId}`;
}

function buildFrequencyPattern(entry: SymptomFrequencyComparisonEntry): Stage4Pattern | null {
  if (entry.direction === "unchanged") return null;

  const observation =
    `${entry.category} was reported on ${entry.currentCount} day` +
    `${entry.currentCount === 1 ? "" : "s"} during the current period, compared with` +
    ` ${entry.previousCount} during the previous period.`;

  const type: Stage4PatternType =
    entry.direction === "increased" ? "frequency_increased" : "frequency_decreased";
  const evidenceRef: Stage4EvidenceRef = { category: entry.category as SymptomCategory };

  if (type === "frequency_increased") {
    return {
      id: buildPatternId(type, evidenceRef),
      type,
      observation,
      interpretation: `This represents an increase in how often ${entry.category} was reported, relative to the previous period.`,
      caveat: FREQUENCY_CAVEAT,
      confidence: "descriptive",
      evidenceRef,
    };
  }

  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation,
    interpretation: `This represents a decrease in how often ${entry.category} was reported, relative to the previous period.`,
    caveat: FREQUENCY_CAVEAT,
    confidence: "descriptive",
    evidenceRef,
  };
}

function buildCoOccurrencePattern(coOccurrence: SymptomCoOccurrenceDto): Stage4Pattern {
  const { categoryA, categoryB, days } = coOccurrence;
  const type: Stage4PatternType = "co_occurrence_detected";
  const evidenceRef: Stage4EvidenceRef = { categoryA, categoryB };
  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation: `${categoryA} and ${categoryB} were both reported during this period.`,
    association: `They were both reported on the same day on ${days} occasion${days === 1 ? "" : "s"}.`,
    interpretation:
      "This indicates the two symptoms tend to occur on the same days. It does not establish that one causes the other.",
    caveat: CO_OCCURRENCE_CAVEAT,
    confidence: "descriptive",
    evidenceRef,
  };
}

function buildTreatmentWindowPattern(entry: BriefTreatmentImpactEntryDto): Stage4Pattern | null {
  if (entry.insufficientData) return null;

  const { before, after } = entry;
  const observation =
    `${entry.name} — ${before.logCount} symptom log${before.logCount === 1 ? "" : "s"} were` +
    ` reported in the ${before.days} days before starting, compared with ${after.logCount}` +
    ` in the ${after.days} days after starting.`;

  const type: Stage4PatternType = "treatment_window_changed";
  const evidenceRef: Stage4EvidenceRef = { treatmentId: entry.treatmentId };

  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation,
    interpretation:
      "This reflects the number of symptom logs recorded before and after this treatment began. It does not establish whether the treatment caused any change.",
    caveat: TREATMENT_WINDOW_CAVEAT,
    confidence: "descriptive",
    evidenceRef,
  };
}

/**
 * Pure and deterministic — same input always produces the same
 * output, in the same order (frequencyComparison's own order, which
 * is itself alphabetical by category — see period-comparison.ts —
 * then the single co-occurrence pattern if any, then treatmentImpact
 * in its own given order).
 */
export function buildStage4Interpretation(input: Stage4Input): Stage4Result {
  const patterns: Stage4Pattern[] = [];

  for (const entry of input.frequencyComparison) {
    const pattern = buildFrequencyPattern(entry);
    if (pattern) patterns.push(pattern);
  }

  if (input.coOccurrence) {
    patterns.push(buildCoOccurrencePattern(input.coOccurrence));
  }

  for (const entry of input.treatmentImpact) {
    const pattern = buildTreatmentWindowPattern(entry);
    if (pattern) patterns.push(pattern);
  }

  return { interpretationVersion: INTERPRETATION_VERSION, patterns };
}
