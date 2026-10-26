import { describe, expect, it } from "vitest";
import type { ClinicalBriefDto } from "@embr/types";
import { briefDayGrid, datesBetween } from "../src/modules/briefs/brief-day-grid.js";

function brief(overrides: Partial<ClinicalBriefDto>): ClinicalBriefDto {
  return {
    fromDate: "2026-10-01",
    toDate: "2026-10-05",
    symptomSummary: [],
    frequencyComparison: [],
    ...overrides,
  } as ClinicalBriefDto;
}

const entry = (category: string, currentDates: string[]) => ({
  category,
  currentCount: currentDates.length,
  previousCount: 0,
  absoluteChange: currentDates.length,
  percentageChange: null,
  direction: "increased",
  currentDates,
  previousDates: [],
});

describe("datesBetween", () => {
  it("lists every date inclusively, across a month end", () => {
    expect(datesBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});

describe("briefDayGrid", () => {
  it("orders rows like the frequency section and marks recorded and empty days", () => {
    const grid = briefDayGrid(
      brief({
        symptomSummary: [
          { category: "HOT_FLASH", count: 2, severityBreakdown: {} },
          { category: "FATIGUE", count: 1, severityBreakdown: {} },
        ],
        frequencyComparison: [
          entry("FATIGUE", ["2026-10-02"]),
          // A date outside the period (a time zone edge) is not drawn.
          entry("HOT_FLASH", ["2026-09-30", "2026-10-01", "2026-10-02"]),
        ] as ClinicalBriefDto["frequencyComparison"],
      }),
    )!;
    expect(grid.days).toHaveLength(5);
    expect(grid.rows.map((r) => r.category)).toEqual(["HOT_FLASH", "FATIGUE"]);
    expect([...grid.rows[0]!.logged]).toEqual(["2026-10-01", "2026-10-02"]);
    expect([...grid.recorded].sort()).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("is absent for a BRIEF that predates per day dates", () => {
    expect(briefDayGrid(brief({ frequencyComparison: null }))).toBeNull();
  });
});
