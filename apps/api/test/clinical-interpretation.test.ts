import { describe, expect, it } from "vitest";
import {
  getClinicalInterpretation,
  coOccurrencePatternId,
  type ClinicalInterpretation,
  type EvidenceTier,
} from "../src/lib/clinical-interpretation.js";

const ALL_SEEDED_PATTERN_IDS = [
  coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS"),
  coOccurrencePatternId("NIGHT_SWEATS", "SLEEP_DISTURBANCE"),
  coOccurrencePatternId("HOT_FLASH", "SLEEP_DISTURBANCE"),
];

function getKnownInterpretation(patternId: string): ClinicalInterpretation {
  const result = getClinicalInterpretation(patternId);
  if (result.kind !== "interpreted") {
    throw new Error(`Expected ${patternId} to be a known, seeded pattern`);
  }
  return result.interpretation;
}

describe("getClinicalInterpretation", () => {
  it("Test 1: a known pattern ID returns the expected interpretation", () => {
    const patternId = coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS");
    const result = getClinicalInterpretation(patternId);

    expect(result.kind).toBe("interpreted");
    if (result.kind === "interpreted") {
      expect(result.interpretation.patternId).toBe(patternId);
      expect(result.interpretation.confidenceLevel).toBe("established");
      expect(result.interpretation.interpretation.length).toBeGreaterThan(0);
    }
  });

  it("Test 2: an unknown pattern ID returns noInterpretationAvailable, never a guess", () => {
    const result = getClinicalInterpretation("co_occurrence:BRAIN_FOG:JOINT_PAIN");

    expect(result.kind).toBe("noInterpretationAvailable");
    if (result.kind === "noInterpretationAvailable") {
      expect(result.patternId).toBe("co_occurrence:BRAIN_FOG:JOINT_PAIN");
    }
  });

  it("a completely made-up pattern ID also returns noInterpretationAvailable", () => {
    const result = getClinicalInterpretation("not_a_real_pattern_id");
    expect(result.kind).toBe("noInterpretationAvailable");
  });

  it("is order-independent — the pattern ID is canonical regardless of argument order", () => {
    const idOneOrder = coOccurrencePatternId("NIGHT_SWEATS", "HOT_FLASH");
    const idOtherOrder = coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS");
    expect(idOneOrder).toBe(idOtherOrder);

    const result = getClinicalInterpretation(idOneOrder);
    expect(result.kind).toBe("interpreted");
  });

  it("is synchronous — no Promise is involved anywhere in the lookup", () => {
    const result = getClinicalInterpretation(coOccurrencePatternId("HOT_FLASH", "NIGHT_SWEATS"));
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("Test 3: every seeded interpretation contains at least one source", () => {
    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      expect(interpretation.sources.length).toBeGreaterThan(0);
    }
  });

  it("every seeded source has real, non-empty provenance fields — no placeholders", () => {
    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      for (const source of interpretation.sources) {
        expect(source.title.length).toBeGreaterThan(0);
        expect(source.organization.length).toBeGreaterThan(0);
        expect(source.publishedOrUpdated.length).toBeGreaterThan(0);
        expect(source.url).toMatch(/^https:\/\//);
        expect(source.url).not.toContain("example.com");
        expect(source.url.toLowerCase()).not.toContain("todo");
        expect(source.url.toLowerCase()).not.toContain("placeholder");
      }
    }
  });

  it("Test 4: every seeded interpretation contains explicit caveats", () => {
    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      expect(interpretation.caveats.length).toBeGreaterThan(0);
      for (const caveat of interpretation.caveats) {
        expect(caveat.length).toBeGreaterThan(0);
      }
    }
  });

  it("Test 5: every seeded interpretation uses a valid evidence tier", () => {
    const validTiers: EvidenceTier[] = ["established", "emerging", "thin"];
    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      expect(validTiers).toContain(interpretation.confidenceLevel);
    }
  });

  it("Test 6: no seeded interpretation uses prohibited diagnostic or causal language", () => {
    const prohibitedPhrases = [
      "this means you have",
      "this proves",
      "your hormones are causing",
      "you have ",
      "diagnos",
      "definitely",
      "certainly causes",
    ];

    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      // "not a diagnosis" is the required safety disclaimer, not a
      // violation — strip it before checking for the prohibited
      // "diagnos" stem, the same way an earlier feature this session
      // had to correct an identical false-positive on "isn't a
      // diagnosis."
      const fullText = [interpretation.interpretation, ...interpretation.caveats]
        .join(" ")
        .toLowerCase()
        .replace(/not a diagnosis/g, "");

      for (const phrase of prohibitedPhrases) {
        expect(fullText).not.toContain(phrase);
      }
    }
  });

  it("each 'established' interpretation is backed by at least one position statement or peer-reviewed study, not only patient education", () => {
    for (const patternId of ALL_SEEDED_PATTERN_IDS) {
      const interpretation = getKnownInterpretation(patternId);
      if (interpretation.confidenceLevel === "established") {
        const hasStrongSource = interpretation.sources.some(
          (s) => s.sourceType === "position_statement" || s.sourceType === "peer_reviewed_study",
        );
        expect(hasStrongSource).toBe(true);
      }
    }
  });

  it("the HOT_FLASH/SLEEP_DISTURBANCE pair is deliberately tiered lower than NIGHT_SWEATS/SLEEP_DISTURBANCE, reflecting the less direct mechanism", () => {
    const hotFlashSleep = getKnownInterpretation(
      coOccurrencePatternId("HOT_FLASH", "SLEEP_DISTURBANCE"),
    );
    const nightSweatsSleep = getKnownInterpretation(
      coOccurrencePatternId("NIGHT_SWEATS", "SLEEP_DISTURBANCE"),
    );
    expect(hotFlashSleep.confidenceLevel).toBe("emerging");
    expect(nightSweatsSleep.confidenceLevel).toBe("established");
  });
});
