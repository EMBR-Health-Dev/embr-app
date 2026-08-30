import { describe, expect, it } from "vitest";
import {
  aggregateBriefTrends,
  DEFAULT_TREND_BRIEF_LIMIT,
  type BriefTrendSourceBrief,
} from "../src/modules/briefs/brief-trends.js";

function brief(overrides: Partial<BriefTrendSourceBrief> = {}): BriefTrendSourceBrief {
  return {
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    symptomSummary: [],
    persistentSymptoms: [],
    ...overrides,
  };
}

function summaryEntry(category: string, count = 5) {
  return { category, count, severityBreakdown: {} };
}

describe("aggregateBriefTrends", () => {
  it("1. zero briefs: briefCount 0, no categories, no crash", () => {
    expect(aggregateBriefTrends([])).toEqual({
      briefCount: 0,
      earliestBriefFromDate: null,
      latestBriefToDate: null,
      categories: [],
    });
  });

  it("2. one brief: presence and persistence both reflect that single brief exactly", () => {
    const result = aggregateBriefTrends([
      brief({
        fromDate: "2026-01-01",
        toDate: "2026-02-01",
        symptomSummary: [summaryEntry("HOT_FLASH")],
        persistentSymptoms: ["HOT_FLASH"],
      }),
    ]);

    expect(result.briefCount).toBe(1);
    expect(result.earliestBriefFromDate).toBe("2026-01-01");
    expect(result.latestBriefToDate).toBe("2026-02-01");
    expect(result.categories).toEqual([
      {
        category: "HOT_FLASH",
        briefsPresent: 1,
        briefsPersistent: 1,
        totalBriefs: 1,
        mostRecentBriefFromDate: "2026-01-01",
        mostRecentBriefToDate: "2026-02-01",
      },
    ]);
  });

  it("3. multiple briefs: counts accumulate across all of them", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: ["HOT_FLASH"] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: ["HOT_FLASH"] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: [] }),
    ]);

    expect(result.briefCount).toBe(3);
    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(3);
    expect(row.briefsPersistent).toBe(2);
    expect(row.totalBriefs).toBe(3);
  });

  it("4. a category appearing in some but not all briefs has briefsPresent less than totalBriefs", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(2);
    expect(row.totalBriefs).toBe(3);
  });

  it("5. a category persistent in some briefs but not others reflects the split exactly", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: ["HOT_FLASH"] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: [] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: ["HOT_FLASH"] }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(3);
    expect(row.briefsPersistent).toBe(2);
  });

  it("6. repeated appearance across every brief does not automatically become persistence", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: [] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: [] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: [] }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(3);
    expect(row.briefsPersistent).toBe(0);
  });

  it("7. mostRecentBrief dates come from the first (most recent) brief a category appears in, given most-recent-first input", () => {
    const result = aggregateBriefTrends([
      brief({
        fromDate: "2026-03-01",
        toDate: "2026-04-01",
        symptomSummary: [summaryEntry("HOT_FLASH")],
      }),
      brief({
        fromDate: "2026-02-01",
        toDate: "2026-03-01",
        symptomSummary: [summaryEntry("HOT_FLASH")],
      }),
      brief({
        fromDate: "2026-01-01",
        toDate: "2026-02-01",
        symptomSummary: [summaryEntry("HOT_FLASH")],
      }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.mostRecentBriefFromDate).toBe("2026-03-01");
    expect(row.mostRecentBriefToDate).toBe("2026-04-01");
  });

  it("8. deterministic ordering: most-present first, alphabetical tiebreak when counts are equal", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("FATIGUE"), summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("BRAIN_FOG")] }),
    ]);

    // HOT_FLASH: present in 2 briefs. FATIGUE and BRAIN_FOG: present
    // in 1 each — tied, so alphabetical: BRAIN_FOG before FATIGUE.
    expect(result.categories.map((c) => c.category)).toEqual(["HOT_FLASH", "BRAIN_FOG", "FATIGUE"]);

    // Run again with the exact same input — same order every time,
    // not an artifact of Map/object iteration order happening to
    // line up once.
    const again = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("FATIGUE"), summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("BRAIN_FOG")] }),
    ]);
    expect(again.categories.map((c) => c.category)).toEqual(
      result.categories.map((c) => c.category),
    );
  });

  it("9. respects an explicit N-brief limit, even when more briefs are passed in", () => {
    const briefs = [
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")] }),
      brief({ symptomSummary: [summaryEntry("FATIGUE")] }), // outside the limit
      brief({ symptomSummary: [summaryEntry("FATIGUE")] }), // outside the limit
    ];

    const result = aggregateBriefTrends(briefs, 3);

    expect(result.briefCount).toBe(3);
    expect(result.categories.map((c) => c.category)).toEqual(["HOT_FLASH"]);
    expect(result.categories.find((c) => c.category === "HOT_FLASH")!.totalBriefs).toBe(3);
  });

  it("uses DEFAULT_TREND_BRIEF_LIMIT (6) when no explicit limit is given", () => {
    const briefs = Array.from({ length: 8 }, (_, i) =>
      brief({ symptomSummary: [summaryEntry(i < 6 ? "HOT_FLASH" : "FATIGUE")] }),
    );

    const result = aggregateBriefTrends(briefs);

    expect(DEFAULT_TREND_BRIEF_LIMIT).toBe(6);
    expect(result.briefCount).toBe(6);
    expect(result.categories.map((c) => c.category)).toEqual(["HOT_FLASH"]);
  });

  it("10a. a brief with a null persistentSymptoms (predates the field) contributes presence but no persistence", () => {
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [summaryEntry("HOT_FLASH")], persistentSymptoms: null }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(1);
    expect(row.briefsPersistent).toBe(0);
  });

  it("10b. a brief with an empty symptomSummary contributes to totalBriefs/briefCount but no category rows", () => {
    const result = aggregateBriefTrends([brief({ symptomSummary: [], persistentSymptoms: [] })]);

    expect(result.briefCount).toBe(1);
    expect(result.categories).toEqual([]);
  });

  it("11. duplicate category entries within a single brief do not inflate briefsPresent or briefsPersistent", () => {
    const result = aggregateBriefTrends([
      brief({
        symptomSummary: [summaryEntry("HOT_FLASH"), summaryEntry("HOT_FLASH")],
        persistentSymptoms: ["HOT_FLASH", "HOT_FLASH"],
      }),
    ]);

    const row = result.categories.find((c) => c.category === "HOT_FLASH")!;
    expect(row.briefsPresent).toBe(1);
    expect(row.briefsPersistent).toBe(1);
  });

  it("a persistentSymptoms entry with no matching symptomSummary entry is ignored, not treated as presence", () => {
    // Shouldn't happen given persistent-symptoms.ts's own rule, but
    // this function doesn't assume that invariant holds for every
    // historical row — defended explicitly.
    const result = aggregateBriefTrends([
      brief({ symptomSummary: [], persistentSymptoms: ["HOT_FLASH"] }),
    ]);

    expect(result.categories).toEqual([]);
  });

  it("earliestBriefFromDate/latestBriefToDate are the actual min/max across the window, not just first/last array position", () => {
    // Most-recent-first by createdAt (array order), but NOT
    // chronologically monotonic by period — a person could generate
    // an older-dated brief after a more recent one. The middle brief
    // here has the widest-spanning dates, not the first or last.
    const result = aggregateBriefTrends([
      brief({ fromDate: "2026-02-01", toDate: "2026-02-15" }),
      brief({ fromDate: "2026-01-01", toDate: "2026-03-01" }),
      brief({ fromDate: "2026-01-15", toDate: "2026-02-10" }),
    ]);

    expect(result.earliestBriefFromDate).toBe("2026-01-01");
    expect(result.latestBriefToDate).toBe("2026-03-01");
  });
});
