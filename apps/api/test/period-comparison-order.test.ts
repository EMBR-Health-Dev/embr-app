import { describe, expect, it } from "vitest";
import { byLargestChange } from "../src/modules/briefs/period-comparison-order.js";

describe("byLargestChange (PDF order)", () => {
  it("matches the web order: largest change, then this period's count, then name", () => {
    const sorted = byLargestChange([
      { category: "BRAIN_FOG", currentCount: 12, previousCount: 13 },
      { category: "HOT_FLASH", currentCount: 15, previousCount: 7 },
      { category: "FATIGUE", currentCount: 3, previousCount: 11 },
      { category: "SLEEP_DISTURBANCE", currentCount: 6, previousCount: 4 },
      { category: "NIGHT_SWEATS", currentCount: 4, previousCount: 2 },
    ] as never[]).map((x: { category: string }) => x.category);
    expect(sorted).toEqual([
      "HOT_FLASH",
      "FATIGUE",
      "SLEEP_DISTURBANCE",
      "NIGHT_SWEATS",
      "BRAIN_FOG",
    ]);
  });
});
