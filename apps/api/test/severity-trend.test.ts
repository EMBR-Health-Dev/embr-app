import { describe, expect, it } from "vitest";
import {
  WEEKLY_TREND_MAX_DAYS,
  summarizeSeverityTrend,
} from "../src/modules/briefs/severity-trend.js";

const log = (category: string, severity: string, iso: string) => ({
  category,
  severity,
  occurredAt: new Date(iso),
});

describe("summarizeSeverityTrend", () => {
  it("splits the period into weeks from its first day, the last one partial", () => {
    const trend = summarizeSeverityTrend([], [], "2026-01-01", "2026-01-17");
    expect(trend.blockDays).toBe(7);
    expect(trend.blocks).toEqual([
      { start: "2026-01-01", end: "2026-01-07" },
      { start: "2026-01-08", end: "2026-01-14" },
      { start: "2026-01-15", end: "2026-01-17" },
    ]);
  });

  it("takes the highest severity and counts distinct days in each week", () => {
    const trend = summarizeSeverityTrend(
      [
        log("HOT_FLASH", "MILD", "2026-01-02T08:00:00Z"),
        log("HOT_FLASH", "SEVERE", "2026-01-02T20:00:00Z"),
        log("HOT_FLASH", "MODERATE", "2026-01-05T09:00:00Z"),
        log("HOT_FLASH", "MILD", "2026-01-15T09:00:00Z"),
      ],
      ["HOT_FLASH"],
      "2026-01-01",
      "2026-01-17",
    );
    expect(trend.rows).toEqual([
      {
        category: "HOT_FLASH",
        cells: [{ peak: "SEVERE", daysLogged: 2 }, null, { peak: "MILD", daysLogged: 1 }],
      },
    ]);
  });

  it("leaves a week with nothing recorded as null, never as none", () => {
    const trend = summarizeSeverityTrend([], ["FATIGUE"], "2026-01-01", "2026-01-14");
    expect(trend.rows[0]!.cells).toEqual([null, null]);
  });

  it("places each entry on her local day", () => {
    // 23:30 UTC on 7 January is 8 January in Tokyo: the second week.
    const late = [log("ANXIETY", "MODERATE", "2026-01-07T23:30:00Z")];
    expect(
      summarizeSeverityTrend(late, ["ANXIETY"], "2026-01-01", "2026-01-14", "UTC").rows[0]!.cells,
    ).toEqual([{ peak: "MODERATE", daysLogged: 1 }, null]);
    expect(
      summarizeSeverityTrend(late, ["ANXIETY"], "2026-01-01", "2026-01-14", "Asia/Tokyo").rows[0]!
        .cells,
    ).toEqual([null, { peak: "MODERATE", daysLogged: 1 }]);
  });

  it("ignores entries outside the period and symptoms not in the summary", () => {
    const trend = summarizeSeverityTrend(
      [
        log("HEADACHE", "SEVERE", "2025-12-31T12:00:00Z"),
        log("FATIGUE", "MILD", "2026-01-02T12:00:00Z"),
      ],
      ["HEADACHE"],
      "2026-01-01",
      "2026-01-07",
    );
    expect(trend.rows).toEqual([{ category: "HEADACHE", cells: [null] }]);
  });

  it("switches to 4 week blocks past 13 weeks", () => {
    const short = summarizeSeverityTrend([], [], "2026-01-01", "2026-04-01"); // 91 days
    expect(short.blockDays).toBe(7);
    expect(short.blocks).toHaveLength(13);
    expect(WEEKLY_TREND_MAX_DAYS).toBe(91);
    const long = summarizeSeverityTrend([], [], "2026-01-01", "2026-12-31");
    expect(long.blockDays).toBe(28);
    expect(long.blocks).toHaveLength(14);
  });
});
