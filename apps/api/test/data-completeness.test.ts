import { describe, expect, it } from "vitest";
import { computeDataCompleteness } from "../src/lib/data-completeness.js";

describe("computeDataCompleteness", () => {
  it("returns 0% when nothing was logged in the range", () => {
    const result = computeDataCompleteness([], new Date("2026-01-01"), new Date("2026-01-31"));

    expect(result).toEqual({ totalDays: 30, daysLogged: 0, completenessPercent: 0 });
  });

  it("returns 100% when every day in the range has at least one log", () => {
    const logs = [
      { occurredAt: new Date("2026-01-01T08:00:00.000Z") },
      { occurredAt: new Date("2026-01-02T08:00:00.000Z") },
      { occurredAt: new Date("2026-01-03T08:00:00.000Z") },
    ];

    const result = computeDataCompleteness(logs, new Date("2026-01-01"), new Date("2026-01-04"));

    expect(result).toEqual({ totalDays: 3, daysLogged: 3, completenessPercent: 100 });
  });

  it("counts a day once regardless of how many logs fall on it", () => {
    const logs = [
      { occurredAt: new Date("2026-01-01T06:00:00.000Z") },
      { occurredAt: new Date("2026-01-01T12:00:00.000Z") },
      { occurredAt: new Date("2026-01-01T22:00:00.000Z") },
    ];

    const result = computeDataCompleteness(logs, new Date("2026-01-01"), new Date("2026-01-08"));

    expect(result.daysLogged).toBe(1);
  });

  it("rounds the percentage to the nearest whole number", () => {
    const logs = [
      { occurredAt: new Date("2026-01-01T08:00:00.000Z") },
      { occurredAt: new Date("2026-01-02T08:00:00.000Z") },
    ];

    // 2 of 3 days logged -> 66.67%, rounds to 67.
    const result = computeDataCompleteness(logs, new Date("2026-01-01"), new Date("2026-01-04"));

    expect(result).toEqual({ totalDays: 3, daysLogged: 2, completenessPercent: 67 });
  });

  it("treats toDate as exclusive, matching this codebase's [from, to) convention elsewhere", () => {
    const logs = [{ occurredAt: new Date("2026-01-04T08:00:00.000Z") }]; // exactly on toDate

    const result = computeDataCompleteness(logs, new Date("2026-01-01"), new Date("2026-01-04"));

    expect(result.daysLogged).toBe(0);
    expect(result.totalDays).toBe(3);
  });

  it("ignores a log outside the given range, defensively, even though callers are expected to pre-filter", () => {
    const logs = [
      { occurredAt: new Date("2026-01-02T08:00:00.000Z") }, // in range
      { occurredAt: new Date("2025-12-25T08:00:00.000Z") }, // well outside
    ];

    const result = computeDataCompleteness(logs, new Date("2026-01-01"), new Date("2026-01-08"));

    expect(result.daysLogged).toBe(1);
  });
});
