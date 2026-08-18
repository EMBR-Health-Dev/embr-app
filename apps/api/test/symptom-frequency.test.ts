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
});
