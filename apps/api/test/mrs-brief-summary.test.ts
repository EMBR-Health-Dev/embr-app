import { describe, expect, it } from "vitest";
import { MRS_ITEMS } from "@embr/validation";
import type { MrsItem } from "@embr/types";
import { mrsBand } from "../src/modules/mrs/mrs-scoring.js";
import { summarizeMrs } from "../src/modules/briefs/mrs-summary.js";

function answersAll(value: number): Record<MrsItem, number> {
  return Object.fromEntries(MRS_ITEMS.map((item) => [item, value])) as Record<MrsItem, number>;
}

describe("mrsBand: the published reference bands (Heinemann 2004, table 6)", () => {
  it.each([
    // total: 0 to 4, 5 to 8, 9 to 16, 17 and above
    ["total", 4, "NONE_OR_LITTLE"],
    ["total", 5, "MILD"],
    ["total", 8, "MILD"],
    ["total", 9, "MODERATE"],
    ["total", 16, "MODERATE"],
    ["total", 17, "SEVERE"],
    // somatic: 0 to 2, 3 to 4, 5 to 8, 9 and above
    ["somatic", 2, "NONE_OR_LITTLE"],
    ["somatic", 3, "MILD"],
    ["somatic", 5, "MODERATE"],
    ["somatic", 9, "SEVERE"],
    // psychological: 0 to 1, 2 to 3, 4 to 6, 7 and above
    ["psychological", 1, "NONE_OR_LITTLE"],
    ["psychological", 2, "MILD"],
    ["psychological", 4, "MODERATE"],
    ["psychological", 7, "SEVERE"],
    // urogenital: 0, 1, 2 to 3, 4 and above
    ["urogenital", 0, "NONE_OR_LITTLE"],
    ["urogenital", 1, "MILD"],
    ["urogenital", 3, "MODERATE"],
    ["urogenital", 4, "SEVERE"],
  ] as const)("%s %i is %s", (key, score, band) => {
    expect(mrsBand(key, score)).toBe(band);
  });
});

describe("summarizeMrs", () => {
  it("is empty without a check-in", () => {
    expect(summarizeMrs([])).toEqual({ checkInsInPeriod: 0, first: null, latest: null });
  });

  it("shows a single check-in as first only", () => {
    const summary = summarizeMrs([{ completedOn: "2026-02-03", answers: answersAll(1) }]);
    expect(summary).toEqual({
      checkInsInPeriod: 1,
      first: {
        completedOn: "2026-02-03",
        scores: { total: 11, somatic: 4, psychological: 4, urogenital: 3 },
        bands: {
          total: "MODERATE",
          somatic: "MILD",
          psychological: "MODERATE",
          urogenital: "MODERATE",
        },
      },
      latest: null,
    });
  });

  it("takes the first and latest by date, whatever order they arrive in", () => {
    const summary = summarizeMrs([
      { completedOn: "2026-02-20", answers: answersAll(0) },
      { completedOn: "2026-02-01", answers: answersAll(2) },
      { completedOn: "2026-02-10", answers: answersAll(1) },
    ]);
    expect(summary.checkInsInPeriod).toBe(3);
    expect(summary.first?.completedOn).toBe("2026-02-01");
    expect(summary.first?.scores.total).toBe(22);
    expect(summary.latest?.completedOn).toBe("2026-02-20");
    expect(summary.latest?.bands.total).toBe("NONE_OR_LITTLE");
  });
});
