import type {
  BriefTreatmentImpactEntryDto,
  Stage4EvidenceRef,
  Stage4Pattern,
  Stage4PatternType,
  Stage4Result,
  SymptomCategory,
  SymptomCoOccurrenceDto,
} from "@embr/types";
import { DEFAULT_LOCALE, type Locale } from "../../lib/locale.js";
import { categoryLabel } from "./brief-locale.js";
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
 * Upper bound on how many patterns buildStage4Interpretation() returns.
 * Nothing before this bounded the count: one entry per symptom
 * category with a qualifying frequency change (up to all 14
 * categories), plus one co-occurrence pattern, plus one per treatment
 * with sufficient before/after data — for an account with several
 * newly-elevated categories (trivially true against a sparse or empty
 * comparison period), that's enough patterns for Stage 5's AI
 * narration to legitimately exceed any fixed max_tokens budget, since
 * the prompt requires every referenced pattern echoed back verbatim
 * (see brief.ai.ts's SYSTEM_PROMPT_EN rule 6). Confirmed in production.
 *
 * No existing significance/priority ranking exists to select which 6
 * matter most — compareSymptomFrequency's own doc comment is explicit
 * that its alphabetical sort is deliberately not by magnitude of
 * change, since that would need a tie-break this codebase has no
 * clinical basis for making. This cap therefore keeps
 * buildStage4Interpretation's existing deterministic order (frequency
 * entries alphabetically, then co-occurrence, then treatment entries
 * in their given order) and simply takes the first 6, rather than
 * inventing a new ranking.
 */
export const MAX_BRIEF_PATTERNS = 6;

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

/**
 * Every observation/interpretation/caveat string below is now built per
 * locale rather than fixed English — these are the same fixed
 * *templates* Stage 4's own doc comment describes (parameterized only
 * by evidence values), just with a Japanese template alongside the
 * English one, not a translation of already-generated English text.
 * This is the layer the task's own "do not translate the AI's output
 * after generation as a workaround" instruction doesn't apply to:
 * nothing here is AI-generated, so there is no English output to
 * translate — locale is simply one more parameter this deterministic
 * composition takes, exactly like `type` and `evidenceRef` already are.
 * Both locales are checked line-by-line against each other to confirm
 * neither adds, drops, strengthens, or weakens a clinical claim: every
 * "does not establish/indicate" boundary present in English is present
 * in Japanese too.
 */
const FREQUENCY_CAVEAT: Record<Locale, string> = {
  en: "This reflects self-reported logging frequency only. It does not indicate severity, cause, or clinical significance.",
  ja: "これは自己申告による記録頻度のみを反映しています。重症度、原因、臨床的な意義を示すものではありません。",
};

const CO_OCCURRENCE_CAVEAT: Record<Locale, string> = {
  en: "This is a temporal association only, not a causal relationship.",
  ja: "これは時間的な関連性を示すものにすぎず、因果関係を示すものではありません。",
};

const TREATMENT_WINDOW_CAVEAT: Record<Locale, string> = {
  en: "This is an observed change over time, not evidence that the treatment caused it.",
  ja: "これは時間経過による観察された変化であり、その治療が原因であることを示す根拠ではありません。",
};

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

function buildFrequencyPattern(
  entry: SymptomFrequencyComparisonEntry,
  locale: Locale,
): Stage4Pattern | null {
  if (entry.direction === "unchanged") return null;

  const category = categoryLabel(entry.category, locale);
  const observation =
    locale === "ja"
      ? `${category}は今回の期間に${entry.currentCount}日報告され、前回の期間は` +
        `${entry.previousCount}日でした。`
      : `${entry.category} was reported on ${entry.currentCount} day` +
        `${entry.currentCount === 1 ? "" : "s"} during the current period, compared with` +
        ` ${entry.previousCount} during the previous period.`;

  const type: Stage4PatternType =
    entry.direction === "increased" ? "frequency_increased" : "frequency_decreased";
  const evidenceRef: Stage4EvidenceRef = { category: entry.category as SymptomCategory };
  const increased = type === "frequency_increased";

  const interpretation =
    locale === "ja"
      ? `これは、前回の期間と比較して${category}の報告頻度が${increased ? "増加" : "減少"}している` +
        `ことを示しています。`
      : increased
        ? `This represents an increase in how often ${entry.category} was reported, relative to the previous period.`
        : `This represents a decrease in how often ${entry.category} was reported, relative to the previous period.`;

  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation,
    interpretation,
    caveat: FREQUENCY_CAVEAT[locale],
    confidence: "descriptive",
    evidenceRef,
  };
}

function buildCoOccurrencePattern(
  coOccurrence: SymptomCoOccurrenceDto,
  locale: Locale,
): Stage4Pattern {
  const { categoryA, categoryB, days } = coOccurrence;
  const type: Stage4PatternType = "co_occurrence_detected";
  const evidenceRef: Stage4EvidenceRef = { categoryA, categoryB };
  const labelA = categoryLabel(categoryA, locale);
  const labelB = categoryLabel(categoryB, locale);

  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation:
      locale === "ja"
        ? `${labelA}と${labelB}は、この期間中にどちらも報告されました。`
        : `${categoryA} and ${categoryB} were both reported during this period.`,
    association:
      locale === "ja"
        ? `同じ日に報告されたのは${days}日です。`
        : `They were both reported on the same day on ${days} occasion${days === 1 ? "" : "s"}.`,
    interpretation:
      locale === "ja"
        ? "これは、2つの症状が同じ日に起こる傾向があることを示しています。一方が他方の原因であること" +
          "を示すものではありません。"
        : "This indicates the two symptoms tend to occur on the same days. It does not establish that one causes the other.",
    caveat: CO_OCCURRENCE_CAVEAT[locale],
    confidence: "descriptive",
    evidenceRef,
  };
}

function buildTreatmentWindowPattern(
  entry: BriefTreatmentImpactEntryDto,
  locale: Locale,
): Stage4Pattern | null {
  if (entry.insufficientData) return null;

  const { before, after } = entry;
  const observation =
    locale === "ja"
      ? `${entry.name}: 開始前${before.days}日間で${before.logCount}件の症状記録があり、開始後` +
        `${after.days}日間で${after.logCount}件でした。`
      : // Colon, not the em dash this template used before — see this
        // file's own doc comment on why this one English string is the
        // sole content edit in this pass: it's user-facing text (PDF
        // and, once cited, the AI narrative) that predates and
        // violates EMBR's standing no-em-dash copy rule, not a
        // rewording of wording this task otherwise leaves untouched.
        `${entry.name}: ${before.logCount} symptom log${before.logCount === 1 ? "" : "s"} were` +
        ` reported in the ${before.days} days before starting, compared with ${after.logCount}` +
        ` in the ${after.days} days after starting.`;

  const type: Stage4PatternType = "treatment_window_changed";
  const evidenceRef: Stage4EvidenceRef = { treatmentId: entry.treatmentId };

  return {
    id: buildPatternId(type, evidenceRef),
    type,
    observation,
    interpretation:
      locale === "ja"
        ? "これは、この治療を開始する前後に記録された症状ログの件数を示しています。治療が変化の原因で" +
          "あるかどうかを示すものではありません。"
        : "This reflects the number of symptom logs recorded before and after this treatment began. It does not establish whether the treatment caused any change.",
    caveat: TREATMENT_WINDOW_CAVEAT[locale],
    confidence: "descriptive",
    evidenceRef,
  };
}

/**
 * Pure and deterministic — same input always produces the same
 * output, in the same order (frequencyComparison's own order, which
 * is itself alphabetical by category — see period-comparison.ts —
 * then the single co-occurrence pattern if any, then treatmentImpact
 * in its own given order), capped at MAX_BRIEF_PATTERNS. The cap keeps
 * this same order and just takes the first N — see MAX_BRIEF_PATTERNS'
 * own doc comment for why nothing here re-ranks by significance.
 */
export function buildStage4Interpretation(
  input: Stage4Input,
  locale: Locale = DEFAULT_LOCALE,
): Stage4Result {
  const patterns: Stage4Pattern[] = [];

  for (const entry of input.frequencyComparison) {
    const pattern = buildFrequencyPattern(entry, locale);
    if (pattern) patterns.push(pattern);
  }

  if (input.coOccurrence) {
    patterns.push(buildCoOccurrencePattern(input.coOccurrence, locale));
  }

  for (const entry of input.treatmentImpact) {
    const pattern = buildTreatmentWindowPattern(entry, locale);
    if (pattern) patterns.push(pattern);
  }

  return {
    interpretationVersion: INTERPRETATION_VERSION,
    patterns: patterns.slice(0, MAX_BRIEF_PATTERNS),
  };
}
