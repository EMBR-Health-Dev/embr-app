import { describe, expect, it } from "vitest";
import {
  scorePerimenopauseAssessment,
  ASSESSMENT_HIGH_TIER_THRESHOLD,
} from "../src/modules/public-assessment/assessment-scoring.js";

describe("scorePerimenopauseAssessment", () => {
  it("scores zero symptoms and no irregular periods as 0, low tier", () => {
    expect(scorePerimenopauseAssessment({ symptoms: [], hasIrregularPeriods: false })).toEqual({
      score: 0,
      tier: "low",
    });
  });

  it("counts each distinct symptom toward the score", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH", "FATIGUE"],
      hasIrregularPeriods: false,
    });
    expect(result.score).toBe(2);
    expect(result.tier).toBe("low");
  });

  it("counts hasIrregularPeriods as one additional point", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH"],
      hasIrregularPeriods: true,
    });
    expect(result.score).toBe(2);
  });

  it("qualifies for the high tier at exactly the threshold", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH", "FATIGUE"],
      hasIrregularPeriods: true,
    });
    expect(result.score).toBe(ASSESSMENT_HIGH_TIER_THRESHOLD);
    expect(result.score).toBe(3);
    expect(result.tier).toBe("high");
  });

  it("stays low tier one point below the threshold", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH", "FATIGUE"],
      hasIrregularPeriods: false,
    });
    expect(result.score).toBe(2);
    expect(result.tier).toBe("low");
  });

  it("deduplicates a symptom submitted more than once — counts once, not twice", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH", "HOT_FLASH", "HOT_FLASH"],
      hasIrregularPeriods: false,
    });
    expect(result.score).toBe(1);
  });

  it("scores every real symptom category correctly at a high count", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: [
        "HOT_FLASH",
        "NIGHT_SWEATS",
        "MOOD_CHANGE",
        "SLEEP_DISTURBANCE",
        "BRAIN_FOG",
        "JOINT_PAIN",
        "FATIGUE",
        "ANXIETY",
      ],
      hasIrregularPeriods: true,
    });
    expect(result.score).toBe(9);
    expect(result.tier).toBe("high");
  });

  it("never returns anything beyond {score, tier} — no probability, confidence, or diagnosis field", () => {
    const result = scorePerimenopauseAssessment({
      symptoms: ["HOT_FLASH"],
      hasIrregularPeriods: false,
    });
    expect(Object.keys(result).sort()).toEqual(["score", "tier"]);
  });
});
