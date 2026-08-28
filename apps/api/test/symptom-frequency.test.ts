import { describe, expect, it } from "vitest";
import { computeSymptomFrequency } from "../src/lib/symptom-frequency.js";

describe("computeSymptomFrequency", () => {
  it("returns an empty array for empty input", () => {
    expect(computeSymptomFrequency([])).toEqual([]);
  });

  it("aggregates a single category", () => {
    const result = computeSymptomFrequency([{ category: "HOT_FLASH", severity: "MODERATE" }]);
    expect(result).toEqual([
      { category: "HOT_FLASH", count: 1, severityBreakdown: { MODERATE: 1 } },
    ]);
  });

  it("aggregates multiple distinct categories", () => {
    const result = computeSymptomFrequency([
      { category: "HOT_FLASH", severity: "MODERATE" },
      { category: "FATIGUE", severity: "MILD" },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.category).sort()).toEqual(["FATIGUE", "HOT_FLASH"]);
  });

  it("counts repeated occurrences of the same category correctly", () => {
    const result = computeSymptomFrequency([
      { category: "HOT_FLASH", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MODERATE" },
      { category: "HOT_FLASH", severity: "MODERATE" },
    ]);
    expect(result).toEqual([
      { category: "HOT_FLASH", count: 3, severityBreakdown: { MILD: 1, MODERATE: 2 } },
    ]);
  });

  it("sorts by descending count", () => {
    const result = computeSymptomFrequency([
      { category: "FATIGUE", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MILD" },
    ]);
    expect(result.map((r) => r.category)).toEqual(["HOT_FLASH", "FATIGUE"]);
    expect(result[0]!.count).toBe(3);
    expect(result[1]!.count).toBe(1);
  });

  it("preserves first-appearance order for tied counts (stable sort)", () => {
    const result = computeSymptomFrequency([
      { category: "BRAIN_FOG", severity: "MILD" },
      { category: "ANXIETY", severity: "MILD" },
    ]);
    expect(result.map((r) => r.category)).toEqual(["BRAIN_FOG", "ANXIETY"]);

    const reversed = computeSymptomFrequency([
      { category: "ANXIETY", severity: "MILD" },
      { category: "BRAIN_FOG", severity: "MILD" },
    ]);
    expect(reversed.map((r) => r.category)).toEqual(["ANXIETY", "BRAIN_FOG"]);
  });

  it("builds a complete severity breakdown across mixed severities", () => {
    const result = computeSymptomFrequency([
      { category: "HOT_FLASH", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MODERATE" },
      { category: "HOT_FLASH", severity: "SEVERE" },
      { category: "HOT_FLASH", severity: "SEVERE" },
    ]);
    expect(result[0]!.severityBreakdown).toEqual({ MILD: 1, MODERATE: 1, SEVERE: 2 });
  });

  it("orders severityBreakdown keys as MILD, MODERATE, SEVERE regardless of the order logs arrived in", () => {
    // Deliberately logged SEVERE, then MILD, then MODERATE — the
    // opposite of canonical order — to prove the result doesn't just
    // happen to match canonical order by coincidence of input order.
    // toEqual alone wouldn't catch a key-order regression (it's a
    // deep-equality check, not an order-sensitive one), so this
    // asserts Object.keys directly.
    const result = computeSymptomFrequency([
      { category: "HOT_FLASH", severity: "SEVERE" },
      { category: "HOT_FLASH", severity: "MILD" },
      { category: "HOT_FLASH", severity: "MODERATE" },
    ]);
    expect(Object.keys(result[0]!.severityBreakdown)).toEqual(["MILD", "MODERATE", "SEVERE"]);
  });

  it("omits absent severities from the ordering rather than inserting a zero", () => {
    const result = computeSymptomFrequency([
      { category: "HOT_FLASH", severity: "SEVERE" },
      { category: "HOT_FLASH", severity: "MILD" },
    ]);
    expect(Object.keys(result[0]!.severityBreakdown)).toEqual(["MILD", "SEVERE"]);
  });
});
