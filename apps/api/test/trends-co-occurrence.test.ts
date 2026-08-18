import { describe, expect, it } from "vitest";
import {
  detectSymptomCoOccurrence,
  MIN_CO_OCCURRENCE_DAYS,
} from "../src/modules/trends/co-occurrence.js";

function log(category: string, isoDate: string) {
  return { category: category as never, occurredAt: new Date(isoDate) };
}

describe("detectSymptomCoOccurrence", () => {
  it("returns the pair when co-occurrence meets the threshold", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01T08:00:00.000Z"),
      log("SLEEP_DISTURBANCE", "2026-01-01T22:00:00.000Z"),
      log("HOT_FLASH", "2026-01-02T08:00:00.000Z"),
      log("SLEEP_DISTURBANCE", "2026-01-02T22:00:00.000Z"),
      log("HOT_FLASH", "2026-01-03T08:00:00.000Z"),
      log("SLEEP_DISTURBANCE", "2026-01-03T22:00:00.000Z"),
    ];

    expect(detectSymptomCoOccurrence(logs)).toEqual({
      categoryA: "HOT_FLASH",
      categoryB: "SLEEP_DISTURBANCE",
      days: 3,
    });
  });

  it("returns null when no pair of categories overlaps at all", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01T08:00:00.000Z"),
      log("HOT_FLASH", "2026-01-02T08:00:00.000Z"),
      log("HOT_FLASH", "2026-01-03T08:00:00.000Z"),
      log("ANXIETY", "2026-02-01T08:00:00.000Z"),
      log("ANXIETY", "2026-02-02T08:00:00.000Z"),
      log("ANXIETY", "2026-02-03T08:00:00.000Z"),
    ];

    expect(detectSymptomCoOccurrence(logs)).toBeNull();
  });

  it("qualifies at exactly the threshold (3 days)", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01"),
      log("FATIGUE", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("FATIGUE", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
      log("FATIGUE", "2026-01-03"),
    ];

    const result = detectSymptomCoOccurrence(logs);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(MIN_CO_OCCURRENCE_DAYS);
    expect(result!.days).toBe(3);
  });

  it("does not qualify one day below the threshold", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01"),
      log("FATIGUE", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("FATIGUE", "2026-01-02"),
      // Only 2 overlapping days — deliberately one short of MIN_CO_OCCURRENCE_DAYS.
    ];

    expect(detectSymptomCoOccurrence(logs)).toBeNull();
  });

  it("selects the pair with the strongest overlap when multiple pairs qualify", () => {
    const logs = [
      // HOT_FLASH + FATIGUE: 3 overlapping days.
      log("HOT_FLASH", "2026-01-01"),
      log("FATIGUE", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("FATIGUE", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
      log("FATIGUE", "2026-01-03"),
      // ANXIETY + BRAIN_FOG: 5 overlapping days — should win.
      log("ANXIETY", "2026-02-01"),
      log("BRAIN_FOG", "2026-02-01"),
      log("ANXIETY", "2026-02-02"),
      log("BRAIN_FOG", "2026-02-02"),
      log("ANXIETY", "2026-02-03"),
      log("BRAIN_FOG", "2026-02-03"),
      log("ANXIETY", "2026-02-04"),
      log("BRAIN_FOG", "2026-02-04"),
      log("ANXIETY", "2026-02-05"),
      log("BRAIN_FOG", "2026-02-05"),
    ];

    expect(detectSymptomCoOccurrence(logs)).toEqual({
      categoryA: "ANXIETY",
      categoryB: "BRAIN_FOG",
      days: 5,
    });
  });

  it("breaks ties deterministically by alphabetical category order, independent of input row order", () => {
    // Two pairs tie at 3 days each: (HEADACHE, MOOD_CHANGE) and
    // (FATIGUE, WEIGHT_CHANGE). Alphabetically, FATIGUE < HEADACHE, so
    // (FATIGUE, WEIGHT_CHANGE) must win regardless of which pair's
    // rows appear first in the input.
    const buildLogs = () => [
      log("HEADACHE", "2026-03-01"),
      log("MOOD_CHANGE", "2026-03-01"),
      log("HEADACHE", "2026-03-02"),
      log("MOOD_CHANGE", "2026-03-02"),
      log("HEADACHE", "2026-03-03"),
      log("MOOD_CHANGE", "2026-03-03"),
      log("FATIGUE", "2026-04-01"),
      log("WEIGHT_CHANGE", "2026-04-01"),
      log("FATIGUE", "2026-04-02"),
      log("WEIGHT_CHANGE", "2026-04-02"),
      log("FATIGUE", "2026-04-03"),
      log("WEIGHT_CHANGE", "2026-04-03"),
    ];

    const forward = detectSymptomCoOccurrence(buildLogs());
    const reversed = detectSymptomCoOccurrence(buildLogs().reverse());

    expect(forward).toEqual({ categoryA: "FATIGUE", categoryB: "WEIGHT_CHANGE", days: 3 });
    expect(reversed).toEqual(forward);
  });

  it("never pairs a category with itself", () => {
    // Only one category logged, no matter how many days — there is no
    // second category to pair it with, so nothing should ever be
    // returned here regardless of day count.
    const logs = [
      log("HOT_FLASH", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
      log("HOT_FLASH", "2026-01-04"),
      log("HOT_FLASH", "2026-01-05"),
    ];

    expect(detectSymptomCoOccurrence(logs)).toBeNull();
  });

  it("counts multiple logs of the same category on the same calendar day as a single day, not multiple", () => {
    const logs = [
      // Three HOT_FLASH entries on the same day, at different times —
      // must still count as one occurrence of that one day.
      log("HOT_FLASH", "2026-01-01T06:00:00.000Z"),
      log("HOT_FLASH", "2026-01-01T12:00:00.000Z"),
      log("HOT_FLASH", "2026-01-01T20:00:00.000Z"),
      log("FATIGUE", "2026-01-01T09:00:00.000Z"),
      log("HOT_FLASH", "2026-01-02"),
      log("FATIGUE", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
      log("FATIGUE", "2026-01-03"),
    ];

    const result = detectSymptomCoOccurrence(logs);
    expect(result).toEqual({ categoryA: "FATIGUE", categoryB: "HOT_FLASH", days: 3 });
  });

  it("treats timestamps on either side of a UTC day boundary as different days", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01T23:59:59.000Z"),
      log("FATIGUE", "2026-01-02T00:00:01.000Z"), // one UTC day later, two seconds apart
      log("HOT_FLASH", "2026-01-02T08:00:00.000Z"),
      log("FATIGUE", "2026-01-02T20:00:00.000Z"),
      log("HOT_FLASH", "2026-01-03T08:00:00.000Z"),
      log("FATIGUE", "2026-01-03T20:00:00.000Z"),
      log("HOT_FLASH", "2026-01-04T08:00:00.000Z"),
      log("FATIGUE", "2026-01-04T20:00:00.000Z"),
    ];

    // Only 2026-01-02, 2026-01-03, and 2026-01-04 genuinely overlap —
    // the 01-01/01-02 pair straddling midnight must NOT be counted as
    // the same day, so this qualifies at exactly 3, not 4.
    const result = detectSymptomCoOccurrence(logs);
    expect(result).toEqual({ categoryA: "FATIGUE", categoryB: "HOT_FLASH", days: 3 });
  });

  it("returns null for an empty dataset", () => {
    expect(detectSymptomCoOccurrence([])).toBeNull();
  });
});
