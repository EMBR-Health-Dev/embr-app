import { describe, expect, it } from "vitest";
import {
  compareSymptomFrequency,
  computePreviousPeriod,
} from "../src/modules/briefs/period-comparison.js";

describe("computePreviousPeriod", () => {
  it("computes the immediately preceding period of equal length, with no gap and no overlap", () => {
    const result = computePreviousPeriod(new Date("2026-08-01"), new Date("2026-08-30"));
    expect(result.from.toISOString().slice(0, 10)).toBe("2026-07-02");
    expect(result.to.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("produces a comparison period of exactly the same duration as the requested period", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-08-30");
    const requestedSpanMs = to.getTime() - from.getTime();

    const previous = computePreviousPeriod(from, to);
    const previousSpanMs = previous.to.getTime() - previous.from.getTime();

    expect(previousSpanMs).toBe(requestedSpanMs);
  });

  it("never overlaps the requested period — the comparison period ends strictly before it starts", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-08-30");
    const previous = computePreviousPeriod(from, to);

    expect(previous.to.getTime()).toBeLessThan(from.getTime());
  });

  it("leaves no gap — the comparison period ends exactly one day before the requested period starts", () => {
    const from = new Date("2026-08-01");
    const to = new Date("2026-08-30");
    const previous = computePreviousPeriod(from, to);

    const gapDays = Math.round((from.getTime() - previous.to.getTime()) / (24 * 60 * 60 * 1000));
    expect(gapDays).toBe(1);
  });

  it("handles a single-day requested period", () => {
    const result = computePreviousPeriod(new Date("2026-08-01"), new Date("2026-08-01"));
    expect(result.from.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(result.to.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("correctly crosses a year boundary", () => {
    const result = computePreviousPeriod(new Date("2026-01-01"), new Date("2026-01-10"));
    expect(result.from.toISOString().slice(0, 10)).toBe("2025-12-22");
    expect(result.to.toISOString().slice(0, 10)).toBe("2025-12-31");
  });
});

describe("compareSymptomFrequency", () => {
  it("reports an increase correctly", () => {
    const result = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    expect(result).toEqual([
      {
        category: "HOT_FLASH",
        currentCount: 6,
        previousCount: 4,
        absoluteChange: 2,
        percentageChange: 50,
        direction: "increased",
      },
    ]);
  });

  it("reports a decrease correctly", () => {
    const result = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 4 }],
      [{ category: "HOT_FLASH", count: 6 }],
    );
    expect(result).toEqual([
      {
        category: "HOT_FLASH",
        currentCount: 4,
        previousCount: 6,
        absoluteChange: -2,
        percentageChange: -33,
        direction: "decreased",
      },
    ]);
  });

  it("reports no change correctly", () => {
    const result = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 5 }],
      [{ category: "HOT_FLASH", count: 5 }],
    );
    expect(result).toEqual([
      {
        category: "HOT_FLASH",
        currentCount: 5,
        previousCount: 5,
        absoluteChange: 0,
        percentageChange: 0,
        direction: "unchanged",
      },
    ]);
  });

  it("does not compute a misleading percentage when the previous period had zero observations", () => {
    const result = compareSymptomFrequency([{ category: "HOT_FLASH", count: 4 }], []);
    expect(result).toEqual([
      {
        category: "HOT_FLASH",
        currentCount: 4,
        previousCount: 0,
        absoluteChange: 4,
        percentageChange: null,
        direction: "increased",
      },
    ]);
  });

  it("handles no current observations as a real, correctly-derived decrease to zero", () => {
    const result = compareSymptomFrequency([], [{ category: "HOT_FLASH", count: 4 }]);
    expect(result).toEqual([
      {
        category: "HOT_FLASH",
        currentCount: 0,
        previousCount: 4,
        absoluteChange: -4,
        percentageChange: -100,
        direction: "decreased",
      },
    ]);
  });

  it("returns an empty array when both periods have no observations at all", () => {
    expect(compareSymptomFrequency([], [])).toEqual([]);
  });

  it("never fabricates an entry for a category absent from both periods", () => {
    const result = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 2 }],
      [{ category: "HOT_FLASH", count: 2 }],
    );
    expect(result.map((r) => r.category)).toEqual(["HOT_FLASH"]);
    expect(result.some((r) => r.category === "FATIGUE")).toBe(false);
  });

  it("compares multiple categories independently and sorts the result alphabetically", () => {
    const result = compareSymptomFrequency(
      [
        { category: "HOT_FLASH", count: 3 },
        { category: "ANXIETY", count: 1 },
      ],
      [
        { category: "FATIGUE", count: 2 },
        { category: "HOT_FLASH", count: 3 },
      ],
    );
    expect(result.map((r) => r.category)).toEqual(["ANXIETY", "FATIGUE", "HOT_FLASH"]);
    expect(result.find((r) => r.category === "ANXIETY")).toMatchObject({
      currentCount: 1,
      previousCount: 0,
      direction: "increased",
      percentageChange: null,
    });
    expect(result.find((r) => r.category === "FATIGUE")).toMatchObject({
      currentCount: 0,
      previousCount: 2,
      direction: "decreased",
      percentageChange: -100,
    });
    expect(result.find((r) => r.category === "HOT_FLASH")).toMatchObject({
      currentCount: 3,
      previousCount: 3,
      direction: "unchanged",
      percentageChange: 0,
    });
  });

  it("rounds the percentage change to the nearest whole number, matching this codebase's existing rounding convention", () => {
    const result = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 1 }],
      [{ category: "HOT_FLASH", count: 3 }],
    );
    // -2/3 = -66.67% -> rounds to -67
    expect(result[0]!.percentageChange).toBe(-67);
  });
});
