import { describe, expect, it } from "vitest";
import { computeCycleLengths, averageCycleLengthDays } from "../src/lib/cycle-length.js";

describe("computeCycleLengths", () => {
  it("returns an empty array for empty input", () => {
    expect(computeCycleLengths([])).toEqual([]);
  });

  it("returns an empty array for a single date — there is no interval to compute yet", () => {
    expect(computeCycleLengths([new Date("2026-01-01")])).toEqual([]);
  });

  it("computes one interval for two dates", () => {
    const result = computeCycleLengths([new Date("2026-01-01"), new Date("2026-01-29")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.days).toBe(28);
    expect(result[0]!.fromDate).toEqual(new Date("2026-01-01"));
    expect(result[0]!.toDate).toEqual(new Date("2026-01-29"));
  });

  it("computes multiple consecutive intervals, matching the existing trends.test.ts fixture exactly", () => {
    const result = computeCycleLengths([
      new Date("2026-01-01"),
      new Date("2026-01-29"),
      new Date("2026-03-01"),
    ]);
    expect(result.map((r) => r.days)).toEqual([28, 31]);
  });

  it("sorts unsorted input before computing intervals", () => {
    const result = computeCycleLengths([
      new Date("2026-03-01"),
      new Date("2026-01-01"),
      new Date("2026-01-29"),
    ]);
    expect(result.map((r) => r.days)).toEqual([28, 31]);
  });

  it("returns intervals in ascending chronological order regardless of input order", () => {
    const result = computeCycleLengths([new Date("2026-03-01"), new Date("2026-01-01")]);
    expect(result[0]!.fromDate).toEqual(new Date("2026-01-01"));
    expect(result[0]!.toDate).toEqual(new Date("2026-03-01"));
  });

  it("handles a leap-year February correctly via plain millisecond diffing, no special-casing needed", () => {
    const result = computeCycleLengths([new Date("2028-02-01"), new Date("2028-03-01")]);
    expect(result[0]!.days).toBe(29);
  });

  it("handles a cycle spanning a non-leap-year February correctly", () => {
    const result = computeCycleLengths([new Date("2026-02-01"), new Date("2026-03-01")]);
    expect(result[0]!.days).toBe(28);
  });

  it("is unaffected by timezone/DST offsets — dates are UTC-midnight-normalized upstream", () => {
    const result = computeCycleLengths([
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-29T00:00:00.000Z"),
    ]);
    expect(result[0]!.days).toBe(28);
  });
});

describe("averageCycleLengthDays", () => {
  it("returns null for an empty interval list", () => {
    expect(averageCycleLengthDays([])).toBeNull();
  });

  it("returns the single interval's day count when there's only one", () => {
    const intervals = computeCycleLengths([new Date("2026-01-01"), new Date("2026-01-29")]);
    expect(averageCycleLengthDays(intervals)).toBe(28);
  });

  it("computes the rounded average across multiple intervals, matching the existing trends.test.ts fixture", () => {
    const intervals = computeCycleLengths([
      new Date("2026-01-01"),
      new Date("2026-01-29"),
      new Date("2026-03-01"),
    ]);
    expect(averageCycleLengthDays(intervals)).toBe(30);
  });
});
