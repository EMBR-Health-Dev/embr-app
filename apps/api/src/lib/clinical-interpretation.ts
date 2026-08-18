import type { SymptomCategory } from "@embr/types";

/**
 * Stage 4 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine, and its references/pipeline-architecture.md +
 * references/taxonomy-building.md for the full design this file
 * implements). This is the missing layer between Stage 3 (deterministic
 * pattern detection — see trends/co-occurrence.ts) and a future Stage 5
 * (AI narration, not built in this milestone).
 *
 * This file must NEVER:
 *   - call an LLM
 *   - generate interpretation text at request time
 *   - fabricate or infer a source
 *   - return anything for a pattern it doesn't have a curated entry for
 *
 * Every ClinicalInterpretation below is hand-written and reviewed like
 * content, not computed. That is the entire point of this layer: two
 * users with the same detected pattern get the identical interpretation,
 * traceable to a real source, every time — not a plausible-sounding
 * generation that happens to differ run to run.
 */

/** "Evidence tier" (the doctrine's own section heading) and
 * "confidenceLevel" (the doctrine's own interface field name in
 * pipeline-architecture.md) refer to the same three-way classification.
 * One field, following the doctrine's existing name, rather than two
 * fields that could silently drift out of sync with each other. */
export type EvidenceTier = "established" | "emerging" | "thin";

export interface EvidenceSource {
  title: string;
  organization: string;
  sourceType:
    "position_statement" | "patient_education" | "peer_reviewed_study" | "validated_instrument";
  /** Free text rather than a strict Date — sources vary between a
   * journal's exact publication date and a patient-education page's
   * "last reviewed" date, and forcing both into one date semantic
   * would itself be a small dishonesty about what's actually known. */
  publishedOrUpdated: string;
  url: string;
}

export interface ClinicalInterpretation {
  patternId: string;
  /** Cautious, non-diagnostic language only — see this file's seeded
   * entries for the actual phrasing bar ("has been associated with,"
   * never "this means you have"). */
  interpretation: string;
  confidenceLevel: EvidenceTier;
  sources: EvidenceSource[];
  caveats: string[];
}

/** Mirrors pipeline-architecture.md's Stage4Result discriminated union,
 * narrowed to this function's actual scope: it is only ever called
 * with a patternId a Stage 3 detector already matched (co-occurrence
 * detection returning null — "no pattern found at all" — is Stage 3's
 * job, not this one's). So only two cases apply here, not
 * pipeline-architecture.md's full three. */
export type ClinicalInterpretationResult =
  | { kind: "interpreted"; interpretation: ClinicalInterpretation }
  | { kind: "noInterpretationAvailable"; patternId: string };

// ---- Pattern ID construction ----

/** Sorts defensively so the same pair always produces the same ID
 * regardless of argument order — belt-and-suspenders alongside the
 * fact that detectSymptomCoOccurrence's own output already guarantees
 * categoryA < categoryB alphabetically, matching that file's own
 * "sorted once, up front" determinism convention. */
export function coOccurrencePatternId(
  categoryA: SymptomCategory,
  categoryB: SymptomCategory,
): string {
  const [a, b] = [categoryA, categoryB].sort();
  return `co_occurrence:${a}:${b}`;
}

// ---- Sources (real, verified directly before writing this file — see
// the accompanying implementation report for how each was found) ----

const MENOPAUSE_SOCIETY_HOT_FLASHES: EvidenceSource = {
  title: "Hot Flashes",
  organization: "The Menopause Society",
  sourceType: "patient_education",
  publishedOrUpdated: "reviewed 2025",
  url: "https://menopause.org/patient-education/menopause-topics/hot-flashes",
};

const AJOG_VMS_CNS_REVIEW: EvidenceSource = {
  title:
    "Vasomotor symptoms in menopause: physiologic condition and central nervous system approaches to treatment",
  organization: "American Journal of Obstetrics & Gynecology",
  sourceType: "peer_reviewed_study",
  publishedOrUpdated: "February 2007",
  url: "https://www.ajog.org/article/S0002-9378(06)02476-8/fulltext",
};

const MDPI_SLEEP_MENOPAUSE_REVIEW: EvidenceSource = {
  title: "Sleep Disturbances in Menopause: Neuroendocrine Mechanisms and Clinical Implications",
  organization: "MDPI (peer-reviewed review)",
  sourceType: "peer_reviewed_study",
  publishedOrUpdated: "2026",
  url: "https://www.mdpi.com/2673-9488/6/2/22",
};

// ---- Registry — intentionally small. Three entries, all for the one
// pattern that already exists (co-occurrence). Not generated, not
// exhaustive — see docs/EVIDENCE_MODEL.md for how and when to add
// more, and this file's own review discipline: a new entry needs a
// real source found and checked before it's written, the same way
// these three were, not reasoned from general medical knowledge. ----

const REGISTRY: ReadonlyMap<string, ClinicalInterpretation> = new Map([
  [
    coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS"),
    {
      patternId: coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS"),
      interpretation:
        "Hot flashes and night sweats are both forms of what clinicians call vasomotor symptoms — the same underlying thermoregulatory response, occurring at different times of day. Their frequent co-occurrence has been associated with this shared mechanism, not with two separate, unrelated symptoms.",
      confidenceLevel: "established",
      sources: [MENOPAUSE_SOCIETY_HOT_FLASHES, AJOG_VMS_CNS_REVIEW],
      caveats: [
        "This describes a well-documented relationship between two symptom categories, not a statement about any individual's specific cause.",
        "This is not a diagnosis of menopause or perimenopause.",
      ],
    } satisfies ClinicalInterpretation,
  ],
  [
    coOccurrencePatternId("NIGHT_SWEATS", "SLEEP_DISTURBANCE"),
    {
      patternId: coOccurrencePatternId("NIGHT_SWEATS", "SLEEP_DISTURBANCE"),
      interpretation:
        "Night sweats have been associated with fragmented sleep in polysomnographic (objective, sleep-lab measured) studies, not only self-reported ones — waking from a night sweat is a direct, well-documented interruption to sleep continuity.",
      confidenceLevel: "established",
      sources: [MDPI_SLEEP_MENOPAUSE_REVIEW, MENOPAUSE_SOCIETY_HOT_FLASHES],
      caveats: [
        "This pattern alone cannot establish that night sweats are the only, or the primary, contributor to sleep disturbance for any individual — sleep is affected by many factors.",
        "This is not a diagnosis of a sleep disorder.",
      ],
    } satisfies ClinicalInterpretation,
  ],
  [
    coOccurrencePatternId("HOT_FLASH", "SLEEP_DISTURBANCE"),
    {
      patternId: coOccurrencePatternId("HOT_FLASH", "SLEEP_DISTURBANCE"),
      interpretation:
        "Research has found relationships between self-reported hot flashes and sleep complaints, though the mechanism connecting daytime hot flashes to sleep quality is less direct than for night sweats specifically, which occur during sleep itself.",
      confidenceLevel: "emerging",
      sources: [AJOG_VMS_CNS_REVIEW, MDPI_SLEEP_MENOPAUSE_REVIEW],
      caveats: [
        "This relationship is less direct than the one documented between night sweats and sleep disturbance — evidence suggests an association, not an established causal mechanism, for daytime hot flashes specifically.",
        "This pattern alone cannot establish causality for any individual.",
        "This is not a diagnosis of a sleep disorder.",
      ],
    } satisfies ClinicalInterpretation,
  ],
]);

// ---- Lookup ----

/** Synchronous and deterministic on purpose — no LLM, no network call,
 * no reason for this to ever be async. Same patternId in, same result
 * out, every time, forever (until a human edits the registry above). */
export function getClinicalInterpretation(patternId: string): ClinicalInterpretationResult {
  const interpretation = REGISTRY.get(patternId);
  if (!interpretation) {
    return { kind: "noInterpretationAvailable", patternId };
  }
  return { kind: "interpreted", interpretation };
}
