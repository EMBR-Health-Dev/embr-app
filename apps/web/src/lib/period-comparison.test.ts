import { describe, expect, it } from "vitest";
import { byLargestChange } from "./period-comparison";

const e = (category: string, currentCount: number, previousCount: number) =>
  ({ category, currentCount, previousCount }) as never;

describe("byLargestChange", () => {
  it("puts the largest change in days first, in either direction", () => {
    const sorted = byLargestChange([
      e("BRAIN_FOG", 12, 13),
      e("HOT_FLASH", 15, 7),
      e("FATIGUE", 3, 11),
      e("MOOD_CHANGE", 3, 1),
    ]).map((x: { category: string }) => x.category);
    expect(sorted).toEqual(["HOT_FLASH", "FATIGUE", "MOOD_CHANGE", "BRAIN_FOG"]);
  });

  it("breaks ties by this period's count, then alphabetically, and never mutates its input", () => {
    const input = [e("NIGHT_SWEATS", 4, 2), e("FATIGUE", 6, 4), e("BRAIN_FOG", 6, 4)];
    const copy = JSON.stringify(input);
    expect(byLargestChange(input).map((x: { category: string }) => x.category)).toEqual([
      "BRAIN_FOG",
      "FATIGUE",
      "NIGHT_SWEATS",
    ]);
    expect(JSON.stringify(input)).toBe(copy);
  });
});
