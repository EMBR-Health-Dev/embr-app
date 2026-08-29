import { describe, expect, it } from "vitest";
import { buildAiSafeStage4Interpretation } from "../src/modules/briefs/stage4-ai-projection.js";
import type { BriefTreatmentImpactEntryDto } from "@embr/types";
import type { Stage4Pattern, Stage4Result } from "../src/modules/briefs/stage4-interpretation.js";

function treatmentImpactEntry(
  overrides: Partial<BriefTreatmentImpactEntryDto> = {},
): BriefTreatmentImpactEntryDto {
  return {
    treatmentId: "t1",
    name: "Estradiol patch",
    category: "HRT",
    windowDays: 14,
    before: { logCount: 2, days: 14 },
    after: { logCount: 5, days: 14 },
    insufficientData: false,
    ...overrides,
  };
}

function treatmentPattern(overrides: Partial<Stage4Pattern> = {}): Stage4Pattern {
  return {
    id: "treatment_window_changed:t1",
    type: "treatment_window_changed",
    observation:
      "Estradiol patch — 2 symptom logs were reported in the 14 days before starting, compared with 5 in the 14 days after starting.",
    interpretation:
      "This reflects the number of symptom logs recorded before and after this treatment began. It does not establish whether the treatment caused any change.",
    caveat: "This is an observed change over time, not evidence that the treatment caused it.",
    confidence: "descriptive",
    evidenceRef: { treatmentId: "t1" },
    ...overrides,
  };
}

function frequencyPattern(overrides: Partial<Stage4Pattern> = {}): Stage4Pattern {
  return {
    id: "frequency_increased:HOT_FLASH",
    type: "frequency_increased",
    observation: "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
    interpretation: "This represents an increase in how often HOT_FLASH was reported.",
    caveat: "This reflects self-reported logging frequency only.",
    confidence: "descriptive",
    evidenceRef: { category: "HOT_FLASH" },
    ...overrides,
  };
}

describe("buildAiSafeStage4Interpretation", () => {
  it("removes the treatment name from a treatment pattern's observation, rebuilt from structured before/after fields", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern()],
    };
    const result = buildAiSafeStage4Interpretation(interpretation, [treatmentImpactEntry()]);

    expect(result.patterns[0]!.observation).not.toContain("Estradiol");
    expect(result.patterns[0]!.observation).toContain("2");
    expect(result.patterns[0]!.observation).toContain("5");
    expect(result.patterns[0]!.observation).toContain("14");
  });

  it("preserves id, type, and evidenceRef on a treatment pattern unchanged", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern()],
    };
    const result = buildAiSafeStage4Interpretation(interpretation, [treatmentImpactEntry()]);

    expect(result.patterns[0]).toMatchObject({
      id: "treatment_window_changed:t1",
      type: "treatment_window_changed",
      evidenceRef: { treatmentId: "t1" },
    });
  });

  it("leaves non-treatment patterns completely unchanged", () => {
    const original = frequencyPattern();
    const interpretation: Stage4Result = { interpretationVersion: "1.0", patterns: [original] };
    const result = buildAiSafeStage4Interpretation(interpretation, []);

    expect(result.patterns[0]).toEqual(original);
  });

  it("handles a mix of treatment and non-treatment patterns, projecting only the treatment one", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [frequencyPattern(), treatmentPattern()],
    };
    const result = buildAiSafeStage4Interpretation(interpretation, [treatmentImpactEntry()]);

    expect(result.patterns[0]!.observation).toContain("HOT_FLASH");
    expect(result.patterns[1]!.observation).not.toContain("Estradiol");
  });

  it("does not mutate the original canonical Stage4Result", () => {
    const original: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern()],
    };
    const originalObservation = original.patterns[0]!.observation;

    buildAiSafeStage4Interpretation(original, [treatmentImpactEntry()]);

    expect(original.patterns[0]!.observation).toBe(originalObservation);
    expect(original.patterns[0]!.observation).toContain("Estradiol");
  });

  it("is deterministic — the same input always produces the same output", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern(), frequencyPattern()],
    };
    const impact = [treatmentImpactEntry()];

    expect(buildAiSafeStage4Interpretation(interpretation, impact)).toEqual(
      buildAiSafeStage4Interpretation(interpretation, impact),
    );
  });

  it("preserves interpretationVersion", () => {
    const interpretation: Stage4Result = { interpretationVersion: "1.0", patterns: [] };
    expect(buildAiSafeStage4Interpretation(interpretation, []).interpretationVersion).toBe("1.0");
  });

  it("the treatment name does not appear anywhere in the projected object's JSON representation", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern(), frequencyPattern()],
    };
    const result = buildAiSafeStage4Interpretation(interpretation, [
      treatmentImpactEntry({ name: "Estradiol patch" }),
    ]);

    expect(JSON.stringify(result)).not.toContain("Estradiol");
  });

  it("works correctly for a treatment with a different name, confirming the projection is general, not hardcoded", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [
        treatmentPattern({
          id: "treatment_window_changed:t2",
          observation: "Magnesium — 1 symptom log before, 3 after.",
          evidenceRef: { treatmentId: "t2" },
        }),
      ],
    };
    const result = buildAiSafeStage4Interpretation(interpretation, [
      treatmentImpactEntry({
        treatmentId: "t2",
        name: "Magnesium",
        before: { logCount: 1, days: 14 },
        after: { logCount: 3, days: 14 },
      }),
    ]);

    expect(JSON.stringify(result)).not.toContain("Magnesium");
    expect(result.patterns[0]!.observation).toContain("1");
    expect(result.patterns[0]!.observation).toContain("3");
  });

  it("throws rather than silently leaking the canonical pattern when no matching treatmentImpact entry exists", () => {
    const interpretation: Stage4Result = {
      interpretationVersion: "1.0",
      patterns: [treatmentPattern({ evidenceRef: { treatmentId: "missing" } })],
    };
    expect(() =>
      buildAiSafeStage4Interpretation(interpretation, [treatmentImpactEntry()]),
    ).toThrow();
  });

  it("returns an empty patterns array unchanged", () => {
    const interpretation: Stage4Result = { interpretationVersion: "1.0", patterns: [] };
    expect(buildAiSafeStage4Interpretation(interpretation, [])).toEqual({
      interpretationVersion: "1.0",
      patterns: [],
    });
  });
});
