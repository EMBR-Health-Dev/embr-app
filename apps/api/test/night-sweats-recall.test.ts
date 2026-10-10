import { describe, expect, it } from "vitest";
import {
  NIGHT_SWEATS_BREAKDOWN_MIN_MORNINGS,
  summarizeNightSweatsRecall,
} from "../src/modules/briefs/night-sweats-recall.js";

describe("summarizeNightSweatsRecall", () => {
  it("reports zero answered mornings for no answers", () => {
    expect(summarizeNightSweatsRecall([])).toEqual({ morningsAnswered: 0, breakdown: null });
  });

  it("never counts a blank morning as none", () => {
    expect(summarizeNightSweatsRecall([null, null, "NONE"])).toEqual({
      morningsAnswered: 1,
      breakdown: null,
    });
  });

  it("holds back the breakdown below the minimum", () => {
    const six = Array(NIGHT_SWEATS_BREAKDOWN_MIN_MORNINGS - 1).fill("ONE");
    expect(summarizeNightSweatsRecall(six).breakdown).toBeNull();
  });

  it("gives every bucket, including zeros, at the minimum", () => {
    const seven = Array(NIGHT_SWEATS_BREAKDOWN_MIN_MORNINGS).fill("FOUR_PLUS");
    expect(summarizeNightSweatsRecall(seven)).toEqual({
      morningsAnswered: 7,
      breakdown: { NONE: 0, ONE: 0, TWO_TO_THREE: 0, FOUR_PLUS: 7 },
    });
  });
});
