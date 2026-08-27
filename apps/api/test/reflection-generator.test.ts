import { describe, expect, it } from "vitest";
import {
  computeLoggingStreakDays,
  generateReflections,
  MIN_STREAK_DAYS,
} from "../src/modules/reflections/reflection-generator.js";

function log(category: string, isoDate: string) {
  return { category: category as never, occurredAt: new Date(`${isoDate}T12:00:00.000Z`) };
}

describe("computeLoggingStreakDays", () => {
  it("counts a streak ending today", () => {
    const dates = new Set(["2026-01-03", "2026-01-02", "2026-01-01"]);
    expect(computeLoggingStreakDays(dates, "2026-01-03")).toBe(3);
  });

  it("counts a streak ending yesterday when nothing is logged yet today", () => {
    const dates = new Set(["2026-01-02", "2026-01-01"]);
    expect(computeLoggingStreakDays(dates, "2026-01-03")).toBe(2);
  });

  it("returns 0 when the most recent log is more than a day old", () => {
    const dates = new Set(["2026-01-01"]);
    expect(computeLoggingStreakDays(dates, "2026-01-03")).toBe(0);
  });

  it("returns 0 for an empty date set", () => {
    expect(computeLoggingStreakDays(new Set(), "2026-01-03")).toBe(0);
  });

  it("stops counting at the first gap, not just the earliest date", () => {
    // Gap on 01-01: the streak is only the 2 most recent days.
    const dates = new Set(["2026-01-03", "2026-01-02", "2025-12-30"]);
    expect(computeLoggingStreakDays(dates, "2026-01-03")).toBe(2);
  });

  it("counts a single logged day as a streak of 1 (callers apply MIN_STREAK_DAYS separately)", () => {
    const dates = new Set(["2026-01-03"]);
    expect(computeLoggingStreakDays(dates, "2026-01-03")).toBe(1);
  });
});

describe("generateReflections", () => {
  const now = new Date("2026-01-03T09:00:00.000Z");

  it("returns an empty array when there is no data at all", () => {
    expect(generateReflections({ weeklySymptomLogs: [], loggedDates: new Set(), now })).toEqual([]);
  });

  it("returns a weekly_frequency reflection with the most-logged category and total count", () => {
    const weeklySymptomLogs = [
      log("HOT_FLASH", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("FATIGUE", "2026-01-02"),
    ];
    const result = generateReflections({ weeklySymptomLogs, loggedDates: new Set(), now });

    expect(result).toContainEqual({
      id: "weekly_frequency:2026-01-03",
      type: "weekly_frequency",
      totalCount: 3,
      topCategory: "HOT_FLASH",
    });
  });

  it("breaks a tie between categories alphabetically, deterministically", () => {
    const weeklySymptomLogs = [log("FATIGUE", "2026-01-01"), log("ANXIETY", "2026-01-01")];
    const result = generateReflections({ weeklySymptomLogs, loggedDates: new Set(), now });

    expect(result[0]).toMatchObject({ topCategory: "ANXIETY" });
  });

  it("omits weekly_frequency entirely when no symptoms were logged this week", () => {
    const result = generateReflections({ weeklySymptomLogs: [], loggedDates: new Set(), now });
    expect(result.find((r) => r.type === "weekly_frequency")).toBeUndefined();
  });

  it("includes a logging_streak reflection once the streak meets MIN_STREAK_DAYS", () => {
    const loggedDates = new Set(["2026-01-03", "2026-01-02"]);
    const result = generateReflections({ weeklySymptomLogs: [], loggedDates, now });

    expect(result).toContainEqual({
      id: "logging_streak:2026-01-03",
      type: "logging_streak",
      days: 2,
    });
    expect(MIN_STREAK_DAYS).toBe(2);
  });

  it("omits logging_streak when the streak is below MIN_STREAK_DAYS", () => {
    const loggedDates = new Set(["2026-01-03"]);
    const result = generateReflections({ weeklySymptomLogs: [], loggedDates, now });
    expect(result.find((r) => r.type === "logging_streak")).toBeUndefined();
  });

  it("returns both reflections, in a fixed order, when both qualify", () => {
    const weeklySymptomLogs = [log("HOT_FLASH", "2026-01-03")];
    const loggedDates = new Set(["2026-01-03", "2026-01-02"]);
    const result = generateReflections({ weeklySymptomLogs, loggedDates, now });

    expect(result.map((r) => r.type)).toEqual(["weekly_frequency", "logging_streak"]);
  });

  it("gives the same result regardless of input array order", () => {
    const a = [log("HOT_FLASH", "2026-01-01"), log("FATIGUE", "2026-01-02")];
    const b = [log("FATIGUE", "2026-01-02"), log("HOT_FLASH", "2026-01-01")];

    const resultA = generateReflections({ weeklySymptomLogs: a, loggedDates: new Set(), now });
    const resultB = generateReflections({ weeklySymptomLogs: b, loggedDates: new Set(), now });
    expect(resultA).toEqual(resultB);
  });
});
