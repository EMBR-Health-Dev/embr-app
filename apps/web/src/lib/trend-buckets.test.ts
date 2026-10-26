import { describe, expect, it } from "vitest";
import { trendBuckets } from "./trend-buckets";

describe("trendBuckets", () => {
  it("splits a range into weeks ending on its last day, oldest first, with a shorter first week", () => {
    const { unit, buckets } = trendBuckets("2026-01-01", "2026-01-20", [
      { date: "2026-01-02", maxSeverity: "MILD", entries: 1 },
      { date: "2026-01-15", maxSeverity: "SEVERE", entries: 3 },
      { date: "2026-01-16", maxSeverity: "MODERATE", entries: 1 },
    ]);
    expect(unit).toBe("week");
    expect(buckets.map((b) => [b.start, b.end, b.length])).toEqual([
      ["2026-01-01", "2026-01-06", 6],
      ["2026-01-07", "2026-01-13", 7],
      ["2026-01-14", "2026-01-20", 7],
    ]);
    expect(buckets.map((b) => [b.daysLogged, b.maxSeverity])).toEqual([
      [1, "MILD"],
      [0, null],
      [2, "SEVERE"],
    ]);
  });

  it("keeps a year in weeks and switches to calendar months beyond it", () => {
    expect(trendBuckets("2025-10-26", "2026-10-26", []).unit).toBe("week");
    const { unit, buckets } = trendBuckets("2024-11-15", "2026-02-10", [
      { date: "2024-11-20", maxSeverity: "MODERATE", entries: 1 },
    ]);
    expect(unit).toBe("month");
    expect(buckets[0]).toMatchObject({
      start: "2024-11-15",
      end: "2024-11-30",
      length: 16,
      daysLogged: 1,
    });
    expect(buckets.at(-1)).toMatchObject({
      start: "2026-02-01",
      end: "2026-02-10",
      length: 10,
      daysLogged: 0,
    });
    expect(buckets).toHaveLength(16);
  });
});
