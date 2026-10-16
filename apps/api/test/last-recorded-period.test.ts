import { describe, expect, it } from "vitest";
import {
  summarizeLastRecordedPeriod,
  wholeMonthsBetween,
} from "../src/modules/briefs/last-recorded-period.js";

describe("wholeMonthsBetween", () => {
  it("counts a month once the same day of the month is reached", () => {
    expect(wholeMonthsBetween("2026-01-15", "2026-02-14")).toBe(0);
    expect(wholeMonthsBetween("2026-01-15", "2026-02-15")).toBe(1);
    expect(wholeMonthsBetween("2025-03-10", "2026-02-01")).toBe(10);
    expect(wholeMonthsBetween("2025-02-01", "2026-02-01")).toBe(12);
  });

  it("never goes below zero", () => {
    expect(wholeMonthsBetween("2026-02-01", "2026-02-01")).toBe(0);
  });
});

describe("summarizeLastRecordedPeriod", () => {
  it("reports the date and whole months before the BRIEF's end", () => {
    expect(summarizeLastRecordedPeriod("2025-01-31", "2026-02-01")).toEqual({
      date: "2025-01-31",
      monthsBeforeBriefEnd: 12,
    });
  });

  it("reports nothing logged as nulls, never as a stage", () => {
    expect(summarizeLastRecordedPeriod(null, "2026-02-01")).toEqual({
      date: null,
      monthsBeforeBriefEnd: null,
    });
  });
});
