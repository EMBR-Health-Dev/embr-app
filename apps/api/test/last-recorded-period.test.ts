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
  it("reports a logged day and whole months before the BRIEF's end", () => {
    expect(summarizeLastRecordedPeriod("2025-01-31", null, "2026-02-01")).toEqual({
      date: "2025-01-31",
      monthsBeforeBriefEnd: 12,
      source: "logged",
    });
  });

  it("uses her reported date when it is the later one", () => {
    expect(summarizeLastRecordedPeriod("2024-05-01", "2025-01-10", "2026-02-01")).toEqual({
      date: "2025-01-10",
      monthsBeforeBriefEnd: 12,
      source: "reported",
    });
    expect(summarizeLastRecordedPeriod(null, "2025-01-10", "2026-02-01")?.source).toBe("reported");
  });

  it("keeps the logged day when it is later, or the same day", () => {
    expect(summarizeLastRecordedPeriod("2025-09-01", "2025-01-10", "2026-02-01")?.source).toBe(
      "logged",
    );
    expect(summarizeLastRecordedPeriod("2025-01-10", "2025-01-10", "2026-02-01")?.source).toBe(
      "logged",
    );
  });

  it("ignores a reported date after the BRIEF's end", () => {
    expect(summarizeLastRecordedPeriod(null, "2026-03-01", "2026-02-01")).toEqual({
      date: null,
      monthsBeforeBriefEnd: null,
    });
  });

  it("reports nothing as nulls, never as a stage", () => {
    expect(summarizeLastRecordedPeriod(null, null, "2026-02-01")).toEqual({
      date: null,
      monthsBeforeBriefEnd: null,
    });
  });
});
