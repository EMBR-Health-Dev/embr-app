import { describe, expect, it } from "vitest";
import { bucketSymptomLogsByWeek } from "../src/modules/timeline/symptom-buckets.js";

function log(category: string, isoDate: string) {
  return { category: category as never, occurredAt: new Date(isoDate) };
}

describe("bucketSymptomLogsByWeek", () => {
  it("returns an empty array for no logs", () => {
    expect(bucketSymptomLogsByWeek([])).toEqual([]);
  });

  it("buckets logs into a single week and counts by category", () => {
    // Mon 2026-06-01 .. Sun 2026-06-07 is one ISO week.
    const logs = [
      log("HOT_FLASH", "2026-06-01T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-03T08:00:00.000Z"),
      log("BRAIN_FOG", "2026-06-05T08:00:00.000Z"),
    ];

    const buckets = bucketSymptomLogsByWeek(logs);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toEqual({
      weekStart: "2026-06-01",
      weekEnd: "2026-06-08",
      totalCount: 3,
      categoryCounts: [
        { category: "HOT_FLASH", count: 2 },
        { category: "BRAIN_FOG", count: 1 },
      ],
      percentChangeFromPreviousNonEmptyWeek: null,
    });
  });

  it("fills in empty weeks between the first and last log, without breaking them", () => {
    const logs = [
      log("HOT_FLASH", "2026-06-01T08:00:00.000Z"), // week of Jun 1
      // week of Jun 8: nothing logged
      log("HOT_FLASH", "2026-06-15T08:00:00.000Z"), // week of Jun 15
    ];

    const buckets = bucketSymptomLogsByWeek(logs);

    expect(buckets.map((b) => b.weekStart)).toEqual(["2026-06-01", "2026-06-08", "2026-06-15"]);
    expect(buckets[1]).toMatchObject({ totalCount: 0, categoryCounts: [] });
  });

  it("computes percent change against the previous non-empty week, skipping empty weeks", () => {
    const logs = [
      log("HOT_FLASH", "2026-06-01T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-02T08:00:00.000Z"), // week 1: total 2
      // week 2 (Jun 8): empty
      log("HOT_FLASH", "2026-06-15T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-16T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-17T08:00:00.000Z"), // week 3: total 3, vs week 1's 2 -> +50%
    ];

    const buckets = bucketSymptomLogsByWeek(logs);

    expect(buckets[0]!.percentChangeFromPreviousNonEmptyWeek).toBeNull();
    expect(buckets[1]!.percentChangeFromPreviousNonEmptyWeek).toBeNull(); // empty week
    expect(buckets[2]!.percentChangeFromPreviousNonEmptyWeek).toBe(50);
  });

  it("computes a negative percent change when the count drops", () => {
    const logs = [
      log("HOT_FLASH", "2026-06-01T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-02T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-03T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-04T08:00:00.000Z"), // week 1: total 4
      log("HOT_FLASH", "2026-06-08T08:00:00.000Z"), // week 2: total 1, vs 4 -> -75%
    ];

    const buckets = bucketSymptomLogsByWeek(logs);

    expect(buckets[1]!.percentChangeFromPreviousNonEmptyWeek).toBe(-75);
  });

  it("breaks category-count ties alphabetically, matching computeSymptomFrequency's precedent", () => {
    const logs = [
      log("BRAIN_FOG", "2026-06-01T08:00:00.000Z"),
      log("ANXIETY", "2026-06-01T08:00:00.000Z"),
    ];

    const buckets = bucketSymptomLogsByWeek(logs);

    expect(buckets[0]!.categoryCounts.map((c) => c.category)).toEqual(["ANXIETY", "BRAIN_FOG"]);
  });

  it("is deterministic regardless of input row order", () => {
    const logsInOrder = [
      log("HOT_FLASH", "2026-06-01T08:00:00.000Z"),
      log("HOT_FLASH", "2026-06-15T08:00:00.000Z"),
    ];
    const logsReversed = [...logsInOrder].reverse();

    expect(bucketSymptomLogsByWeek(logsInOrder)).toEqual(bucketSymptomLogsByWeek(logsReversed));
  });
});
