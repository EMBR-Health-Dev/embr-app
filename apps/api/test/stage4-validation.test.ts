import { describe, expect, it } from "vitest";
import { validateStage4Patterns } from "../src/modules/briefs/stage4-validation.js";
import type { Stage4Pattern } from "../src/modules/briefs/stage4-interpretation.js";

function pattern(overrides: Partial<Stage4Pattern> = {}): Stage4Pattern {
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

describe("validateStage4Patterns", () => {
  it("accepts an empty returned array against any expected set", () => {
    const result = validateStage4Patterns([pattern()], []);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([]);
  });

  it("accepts an empty expected array with an empty returned array", () => {
    const result = validateStage4Patterns([], []);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([]);
  });

  it("accepts a returned pattern that exactly matches an expected one", () => {
    const expected = pattern();
    const returned = pattern();
    const result = validateStage4Patterns([expected], [returned]);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([expected]);
  });

  it("accepts a returned subset — not every expected pattern needs to be echoed", () => {
    const hotFlash = pattern({ id: "frequency_increased:HOT_FLASH" });
    const fatigue = pattern({
      id: "frequency_decreased:FATIGUE",
      type: "frequency_decreased",
      evidenceRef: { category: "FATIGUE" },
    });
    // Only echoes fatigue, not hotFlash — that's allowed per
    // brief.ai.ts's own system prompt (only include patterns actually
    // referenced), not a defect.
    const result = validateStage4Patterns([hotFlash, fatigue], [fatigue]);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([fatigue]);
  });

  it("rejects a returned pattern whose id was never supplied", () => {
    const result = validateStage4Patterns([pattern()], [pattern({ id: "invented:ID" })]);
    expect(result.error).toMatch(/never supplied/);
    expect(result.error).toContain("invented:ID");
    expect(result.patterns).toBeUndefined();
  });

  it("rejects a duplicate returned id", () => {
    const expected = pattern();
    const result = validateStage4Patterns([expected], [pattern(), pattern()]);
    expect(result.error).toMatch(/more than once/);
  });

  it("rejects a returned pattern whose type was changed while keeping the same id", () => {
    const expected = pattern({ id: "frequency_increased:HOT_FLASH", type: "frequency_increased" });
    const tampered = pattern({
      id: "frequency_increased:HOT_FLASH",
      type: "frequency_decreased", // same id, different type
    });
    const result = validateStage4Patterns([expected], [tampered]);
    expect(result.error).toMatch(/changed the type/);
  });

  it("rejects a returned pattern whose category evidenceRef was changed while keeping the same id", () => {
    const expected = pattern({ evidenceRef: { category: "HOT_FLASH" } });
    const tampered = pattern({ evidenceRef: { category: "FATIGUE" } });
    const result = validateStage4Patterns([expected], [tampered]);
    expect(result.error).toMatch(/changed the evidenceRef/);
  });

  it("rejects a returned pattern whose evidenceRef shape was changed entirely while keeping the same id", () => {
    const expected = pattern({
      id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
      type: "co_occurrence_detected",
      evidenceRef: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH" },
    });
    const tampered = pattern({
      id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
      type: "co_occurrence_detected",
      evidenceRef: { treatmentId: "t1" } as unknown as Stage4Pattern["evidenceRef"],
    });
    const result = validateStage4Patterns([expected], [tampered]);
    expect(result.error).toMatch(/changed the evidenceRef/);
  });

  it("accepts a co-occurrence evidenceRef regardless of key order — structural, not string, comparison", () => {
    const expected = pattern({
      id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
      type: "co_occurrence_detected",
      evidenceRef: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH" },
    });
    // Same values, keys constructed in the opposite order — a naive
    // JSON.stringify comparison would reject this even though it's
    // semantically identical.
    const returned = pattern({
      id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
      type: "co_occurrence_detected",
      evidenceRef: { categoryB: "HOT_FLASH", categoryA: "BRAIN_FOG" },
    });
    const result = validateStage4Patterns([expected], [returned]);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([expected]);
  });

  it("accepts a treatment_window_changed evidenceRef that matches", () => {
    const expected = pattern({
      id: "treatment_window_changed:t1",
      type: "treatment_window_changed",
      evidenceRef: { treatmentId: "t1" },
    });
    const returned = pattern({
      id: "treatment_window_changed:t1",
      type: "treatment_window_changed",
      evidenceRef: { treatmentId: "t1" },
    });
    const result = validateStage4Patterns([expected], [returned]);
    expect(result.error).toBeNull();
    expect(result.patterns).toEqual([expected]);
  });

  it("does not compare observation/interpretation/caveat text for pass/fail — only id, type, and evidenceRef are provenance fields", () => {
    const expected = pattern({ observation: "Original observation text." });
    const returned = pattern({ observation: "A completely different sentence." });
    // Deliberately still valid: the id/type/evidenceRef triple matches,
    // which is all this function is responsible for checking. See its
    // own doc comment for why prose fields are explicitly out of scope
    // for the pass/fail decision — but see the canonicalization tests
    // below for what happens to the mismatched text itself.
    const result = validateStage4Patterns([expected], [returned]);
    expect(result.error).toBeNull();
  });

  it("validates multiple returned patterns independently — one invalid pattern fails the whole check", () => {
    const valid = pattern({ id: "frequency_increased:HOT_FLASH" });
    const invalid = pattern({ id: "frequency_increased:HOT_FLASH", type: "frequency_decreased" });
    const result = validateStage4Patterns([valid], [valid, invalid]);
    // Same id appears twice with the second altered — caught either as
    // a duplicate id or a type mismatch, but never silently accepted.
    expect(result.error).not.toBeNull();
  });

  describe("canonicalization — the returned .patterns are never the AI's own objects", () => {
    it("substitutes the canonical pattern even when only its prose text was altered", () => {
      const expected = pattern({
        observation: "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
      });
      // Exactly the scenario this hardening exists for: id/type/
      // evidenceRef genuinely match a real, supplied pattern, but the
      // model's own copy of the observation text has been altered —
      // here, exaggerated far beyond what the real evidence supports.
      const returned = pattern({
        observation: "HOT_FLASH was reported on 200 days, a massive and alarming increase.",
      });
      const result = validateStage4Patterns([expected], [returned]);
      expect(result.error).toBeNull();
      // The returned object is the canonical one — the tampered
      // observation text from `returned` must not survive into the
      // result at all.
      expect(result.patterns).toEqual([expected]);
      expect(result.patterns?.[0].observation).not.toBe(returned.observation);
      expect(result.patterns?.[0].observation).toBe(expected.observation);
    });

    it("substitutes the canonical pattern even when interpretation and caveat text were both altered", () => {
      const expected = pattern({
        interpretation: "This represents an increase in how often HOT_FLASH was reported.",
        caveat: "This reflects self-reported logging frequency only.",
      });
      const returned = pattern({
        interpretation: "This strongly suggests a hormonal imbalance requiring treatment.",
        caveat: "This is a serious finding.",
      });
      const result = validateStage4Patterns([expected], [returned]);
      expect(result.error).toBeNull();
      expect(result.patterns).toEqual([expected]);
      expect(result.patterns?.[0].interpretation).toBe(expected.interpretation);
      expect(result.patterns?.[0].caveat).toBe(expected.caveat);
    });

    it("preserves the AI's own citation order across multiple returned patterns", () => {
      const hotFlash = pattern({ id: "frequency_increased:HOT_FLASH" });
      const fatigue = pattern({
        id: "frequency_decreased:FATIGUE",
        type: "frequency_decreased",
        evidenceRef: { category: "FATIGUE" },
      });
      // Cited in the opposite order from how they were supplied.
      const result = validateStage4Patterns([hotFlash, fatigue], [fatigue, hotFlash]);
      expect(result.error).toBeNull();
      expect(result.patterns?.map((p) => p.id)).toEqual([fatigue.id, hotFlash.id]);
    });

    it("returns object identity to the expected pattern, not a deep clone", () => {
      // Not load-bearing behavior on its own, but worth pinning: the
      // canonical objects returned are the exact same references
      // passed in via expectedPatterns, confirming nothing here
      // constructs a new object from any part of `returned`.
      const expected = pattern();
      const result = validateStage4Patterns([expected], [pattern()]);
      expect(result.patterns?.[0]).toBe(expected);
    });
  });
});
