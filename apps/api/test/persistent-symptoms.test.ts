import { describe, expect, it } from "vitest";
import {
  detectPersistentSymptoms,
  MIN_PERSISTENT_COUNT,
} from "../src/modules/briefs/persistent-symptoms.js";
import { compareSymptomFrequency } from "../src/modules/briefs/period-comparison.js";

// Small helper so each test can express its scenario directly as
// {category, currentCount, previousCount} rather than hand-building
// the full SymptomFrequencyComparisonEntry shape (absoluteChange/
// percentageChange/direction are irrelevant to this filter and left
// out here — reusing compareSymptomFrequency to build the real shape
// instead of fabricating it independently, so a change to that
// function's output shape can't silently drift out of sync with what
// this test file assumes it looks like).
function comparisonFor(current: Record<string, number>, previous: Record<string, number>) {
  return compareSymptomFrequency(
    Object.entries(current).map(([category, count]) => ({ category, count })),
    Object.entries(previous).map(([category, count]) => ({ category, count })),
  );
}

describe("detectPersistentSymptoms", () => {
  it("flags a category present in both periods, at or above the floor in the current period", () => {
    const comparison = comparisonFor({ HOT_FLASH: 3 }, { HOT_FLASH: 5 });
    expect(detectPersistentSymptoms(comparison)).toEqual(["HOT_FLASH"]);
  });

  it("does not flag a category below MIN_PERSISTENT_COUNT in the current period", () => {
    const comparison = comparisonFor({ HOT_FLASH: MIN_PERSISTENT_COUNT - 1 }, { HOT_FLASH: 5 });
    expect(detectPersistentSymptoms(comparison)).toEqual([]);
  });

  it("qualifies at exactly MIN_PERSISTENT_COUNT", () => {
    const comparison = comparisonFor({ HOT_FLASH: MIN_PERSISTENT_COUNT }, { HOT_FLASH: 1 });
    expect(detectPersistentSymptoms(comparison)).toEqual(["HOT_FLASH"]);
  });

  it("does not flag a category absent from the previous period, no matter how frequent now", () => {
    const comparison = comparisonFor({ HOT_FLASH: 10 }, {});
    expect(detectPersistentSymptoms(comparison)).toEqual([]);
  });

  it("does not flag a category absent from the current period, no matter how frequent before", () => {
    const comparison = comparisonFor({}, { HOT_FLASH: 10 });
    expect(detectPersistentSymptoms(comparison)).toEqual([]);
  });

  it("requires only presence (not a floor) in the previous period", () => {
    // Previously logged just once, but currently well above the floor
    // — still counts: the question is "is this still going on," which
    // only needs the prior period to have registered it at all.
    const comparison = comparisonFor({ HOT_FLASH: 5 }, { HOT_FLASH: 1 });
    expect(detectPersistentSymptoms(comparison)).toEqual(["HOT_FLASH"]);
  });

  it("returns an empty array, not null or undefined, when nothing qualifies", () => {
    const comparison = comparisonFor({}, {});
    expect(detectPersistentSymptoms(comparison)).toEqual([]);
  });

  it("evaluates multiple categories independently", () => {
    const comparison = comparisonFor(
      { HOT_FLASH: 5, BRAIN_FOG: 1, FATIGUE: 4 },
      { HOT_FLASH: 3, BRAIN_FOG: 2 }, // FATIGUE newly reported this period only
    );
    expect(detectPersistentSymptoms(comparison)).toEqual(["HOT_FLASH"]);
  });

  it("preserves compareSymptomFrequency's own alphabetical ordering rather than re-sorting", () => {
    const comparison = comparisonFor(
      { HOT_FLASH: 4, ANXIETY: 3, BRAIN_FOG: 5 },
      { HOT_FLASH: 1, ANXIETY: 1, BRAIN_FOG: 1 },
    );
    expect(detectPersistentSymptoms(comparison)).toEqual(["ANXIETY", "BRAIN_FOG", "HOT_FLASH"]);
  });
});
