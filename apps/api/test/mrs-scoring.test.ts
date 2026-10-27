import { describe, expect, it } from "vitest";
import { MRS_ITEMS } from "@embr/validation";
import type { MrsItem } from "@embr/types";
import { MRS_SUBSCALES, scoreMrs } from "../src/modules/mrs/mrs-scoring.js";

function answersAll(value: number): Record<MrsItem, number> {
  return Object.fromEntries(MRS_ITEMS.map((item) => [item, value])) as Record<MrsItem, number>;
}

describe("scoreMrs", () => {
  it("puts every item in exactly one published subscale", () => {
    const assigned = Object.values(MRS_SUBSCALES).flat();
    expect([...assigned].sort()).toEqual([...MRS_ITEMS].sort());
  });

  it("scores all none as zero everywhere", () => {
    expect(scoreMrs(answersAll(0))).toEqual({
      total: 0,
      somatic: 0,
      psychological: 0,
      urogenital: 0,
    });
  });

  it("scores all very severe as the published maxima", () => {
    expect(scoreMrs(answersAll(4))).toEqual({
      total: 44,
      somatic: 16,
      psychological: 16,
      urogenital: 12,
    });
  });

  it("adds each answer only to its own subscale", () => {
    const answers = { ...answersAll(0), hotFlushes: 4, anxiety: 2, bladderProblems: 1 };
    expect(scoreMrs(answers)).toEqual({ total: 7, somatic: 4, psychological: 2, urogenital: 1 });
  });
});
