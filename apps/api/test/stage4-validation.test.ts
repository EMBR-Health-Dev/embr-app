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
    expect(validateStage4Patterns([pattern()], [])).toBeNull();
  });

  it("accepts an empty expected array with an empty returned array", () => {
    expect(validateStage4Patterns([], [])).toBeNull();
  });

  it("accepts a returned pattern that exactly matches an expected one", () => {
    const expected = pattern();
    const returned = pattern();
    expect(validateStage4Patterns([expected], [returned])).toBeNull();
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
    expect(validateStage4Patterns([hotFlash, fatigue], [fatigue])).toBeNull();
  });

  it("rejects a returned pattern whose id was never supplied", () => {
    const failure = validateStage4Patterns([pattern()], [pattern({ id: "invented:ID" })]);
    expect(failure).toMatch(/never supplied/);
    expect(failure).toContain("invented:ID");
  });

  it("rejects a duplicate returned id", () => {
    const expected = pattern();
    const failure = validateStage4Patterns([expected], [pattern(), pattern()]);
    expect(failure).toMatch(/more than once/);
  });

  it("rejects a returned pattern whose type was changed while keeping the same id", () => {
    const expected = pattern({ id: "frequency_increased:HOT_FLASH", type: "frequency_increased" });
    const tampered = pattern({
      id: "frequency_increased:HOT_FLASH",
      type: "frequency_decreased", // same id, different type
    });
    const failure = validateStage4Patterns([expected], [tampered]);
    expect(failure).toMatch(/changed the type/);
  });

  it("rejects a returned pattern whose category evidenceRef was changed while keeping the same id", () => {
    const expected = pattern({ evidenceRef: { category: "HOT_FLASH" } });
    const tampered = pattern({ evidenceRef: { category: "FATIGUE" } });
    const failure = validateStage4Patterns([expected], [tampered]);
    expect(failure).toMatch(/changed the evidenceRef/);
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
    const failure = validateStage4Patterns([expected], [tampered]);
    expect(failure).toMatch(/changed the evidenceRef/);
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
    expect(validateStage4Patterns([expected], [returned])).toBeNull();
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
    expect(validateStage4Patterns([expected], [returned])).toBeNull();
  });

  it("does not compare observation/interpretation/caveat text — only id, type, and evidenceRef are provenance fields", () => {
    const expected = pattern({ observation: "Original observation text." });
    const returned = pattern({ observation: "A completely different sentence." });
    // Deliberately still valid: the id/type/evidenceRef triple matches,
    // which is all this function is responsible for checking. See its
    // own doc comment for why prose fields are explicitly out of scope
    // here.
    expect(validateStage4Patterns([expected], [returned])).toBeNull();
  });

  it("validates multiple returned patterns independently — one invalid pattern fails the whole check", () => {
    const valid = pattern({ id: "frequency_increased:HOT_FLASH" });
    const invalid = pattern({ id: "frequency_increased:HOT_FLASH", type: "frequency_decreased" });
    const failure = validateStage4Patterns([valid], [valid, invalid]);
    // Same id appears twice with the second altered — caught either as
    // a duplicate id or a type mismatch, but never silently accepted.
    expect(failure).not.toBeNull();
  });
});
