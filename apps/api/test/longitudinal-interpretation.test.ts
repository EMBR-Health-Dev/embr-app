import { describe, expect, it } from "vitest";
import {
  buildLongitudinalInterpretation,
  MIN_BRIEFS_FOR_LONGITUDINAL_PATTERNS,
} from "../src/modules/briefs/longitudinal-interpretation.js";
import type { BriefTrendCategoryRow } from "../src/modules/briefs/brief-trends.js";

function row(overrides: Partial<BriefTrendCategoryRow> = {}): BriefTrendCategoryRow {
  return {
    category: "HOT_FLASH",
    briefsPresent: 3,
    briefsPersistent: 0,
    totalBriefs: 3,
    mostRecentBriefFromDate: "2026-01-01",
    mostRecentBriefToDate: "2026-02-01",
    ...overrides,
  };
}

describe("buildLongitudinalInterpretation", () => {
  it("MIN_BRIEFS_FOR_LONGITUDINAL_PATTERNS is 2 — a single brief can never establish a longitudinal claim", () => {
    expect(MIN_BRIEFS_FOR_LONGITUDINAL_PATTERNS).toBe(2);
  });

  it("produces no patterns when briefCount is 0", () => {
    const result = buildLongitudinalInterpretation({ briefCount: 0, categories: [] });
    expect(result).toEqual([]);
  });

  it("produces no patterns when briefCount is 1, even if that one brief's category row looks 'recurring' by coincidence", () => {
    // briefsPresent === totalBriefs (1 === 1) would trivially satisfy
    // the recurring check on its own — this proves the briefCount
    // floor is enforced independently of what the category rows
    // themselves say, not merely incidentally true given the fixture.
    const result = buildLongitudinalInterpretation({
      briefCount: 1,
      categories: [row({ briefsPresent: 1, totalBriefs: 1 })],
    });
    expect(result).toEqual([]);
  });

  it("a category present in every brief in the window is reported as recurring", () => {
    const result = buildLongitudinalInterpretation({
      briefCount: 3,
      categories: [row({ category: "HOT_FLASH", briefsPresent: 3, totalBriefs: 3 })],
    });
    expect(result).toEqual([
      {
        id: "recurring_across_briefs:HOT_FLASH",
        type: "recurring_across_briefs",
        category: "HOT_FLASH",
        observation: "HOT_FLASH was reported in every one of your last 3 briefs.",
        briefsPresent: 3,
        totalBriefs: 3,
      },
    ]);
  });

  it("a category present in most, but not all, briefs is not reported as recurring", () => {
    const result = buildLongitudinalInterpretation({
      briefCount: 6,
      categories: [row({ briefsPresent: 5, totalBriefs: 6 })],
    });
    expect(result).toEqual([]);
  });

  it("a category present in exactly 2 of 2 briefs (the minimum possible window) is reported as recurring", () => {
    const result = buildLongitudinalInterpretation({
      briefCount: 2,
      categories: [row({ briefsPresent: 2, totalBriefs: 2 })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("recurring_across_briefs:HOT_FLASH");
  });

  it("evaluates every category row independently — some recurring, some not, in the same window", () => {
    const result = buildLongitudinalInterpretation({
      briefCount: 4,
      categories: [
        row({ category: "HOT_FLASH", briefsPresent: 4, totalBriefs: 4 }),
        row({ category: "FATIGUE", briefsPresent: 2, totalBriefs: 4 }),
        row({ category: "BRAIN_FOG", briefsPresent: 4, totalBriefs: 4 }),
      ],
    });
    expect(result.map((p) => p.category)).toEqual(["HOT_FLASH", "BRAIN_FOG"]);
  });

  it("briefsPersistent (single-brief persistence) has no bearing on a longitudinal recurring pattern — a different signal from a different field", () => {
    // Never classified as persistent within any individual brief, but
    // still reported in every brief — still recurring longitudinally.
    // Proves this function reads briefsPresent/totalBriefs only, never
    // briefsPersistent.
    const result = buildLongitudinalInterpretation({
      briefCount: 3,
      categories: [row({ briefsPresent: 3, totalBriefs: 3, briefsPersistent: 0 })],
    });
    expect(result).toHaveLength(1);
  });

  it("produces no patterns when there are no category rows at all", () => {
    const result = buildLongitudinalInterpretation({ briefCount: 5, categories: [] });
    expect(result).toEqual([]);
  });

  it("ids are deterministic — the same category and type always produce the same id", () => {
    const first = buildLongitudinalInterpretation({
      briefCount: 2,
      categories: [row({ category: "NIGHT_SWEATS", briefsPresent: 2, totalBriefs: 2 })],
    });
    const second = buildLongitudinalInterpretation({
      briefCount: 2,
      categories: [row({ category: "NIGHT_SWEATS", briefsPresent: 2, totalBriefs: 2 })],
    });
    expect(first[0].id).toBe(second[0].id);
  });
});
