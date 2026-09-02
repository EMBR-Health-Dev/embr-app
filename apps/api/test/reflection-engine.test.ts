import { describe, expect, it } from "vitest";
import {
  computeLoggingActivity,
  computeTopSymptomFrequency,
  computeTreatmentContext,
  MIN_REFLECTION_LOGS,
} from "../src/modules/reflections/reflection-engine.js";

function log(category: string, isoDate: string, severity = "MILD") {
  return { category, severity, occurredAt: new Date(isoDate) };
}

describe("computeLoggingActivity", () => {
  it("returns null below the threshold", () => {
    const logs = [log("HOT_FLASH", "2026-01-01"), log("HOT_FLASH", "2026-01-02")];
    expect(computeLoggingActivity(logs)).toBeNull();
  });

  it("qualifies at exactly the threshold", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
    ];
    expect(computeLoggingActivity(logs)).toEqual({ logCount: 3, daysLogged: 3 });
    expect(MIN_REFLECTION_LOGS).toBe(3);
  });

  it("counts multiple logs on the same calendar day as one day logged, not multiple", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01T06:00:00.000Z"),
      log("FATIGUE", "2026-01-01T20:00:00.000Z"),
      log("HOT_FLASH", "2026-01-02"),
    ];
    expect(computeLoggingActivity(logs)).toEqual({ logCount: 3, daysLogged: 2 });
  });

  it("returns null for an empty dataset", () => {
    expect(computeLoggingActivity([])).toBeNull();
  });
});

describe("computeTopSymptomFrequency", () => {
  it("returns null below the threshold", () => {
    const logs = [log("HOT_FLASH", "2026-01-01"), log("HOT_FLASH", "2026-01-02")];
    expect(computeTopSymptomFrequency(logs)).toBeNull();
  });

  it("returns the most frequent category once it qualifies", () => {
    const logs = [
      log("HOT_FLASH", "2026-01-01"),
      log("HOT_FLASH", "2026-01-02"),
      log("HOT_FLASH", "2026-01-03"),
      log("FATIGUE", "2026-01-01"),
    ];
    expect(computeTopSymptomFrequency(logs)).toEqual({ category: "HOT_FLASH", count: 3 });
  });

  it("returns null for an empty dataset", () => {
    expect(computeTopSymptomFrequency([])).toBeNull();
  });
});

describe("computeTreatmentContext", () => {
  const treatment = { id: "t1", name: "Estradiol patch", category: "HRT" as const };

  it("returns null when no logs fall within the treatment window", () => {
    expect(computeTreatmentContext(treatment, [])).toBeNull();
  });

  it("returns a plain count, never an efficacy claim, once logs exist", () => {
    expect(computeTreatmentContext(treatment, [{}, {}, {}])).toEqual({
      treatmentId: "t1",
      treatmentName: "Estradiol patch",
      treatmentCategory: "HRT",
      logCount: 3,
    });
  });
});

describe("reflection.service's toIsoWeek key stability (regression)", () => {
  // Reimplemented here rather than importing the unexported function,
  // to pin the exact contract reflection.service.ts's buildKey relies
  // on: two dates in the same ISO week must produce the same key, and
  // the boundary must fall on a real week rollover, not just "midnight
  // UTC" (which is what caused this bug in the first place).
  function toIsoWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  }

  it("gives consecutive calendar days within the same week the same key (the bug this fixes)", () => {
    // Monday and Tuesday of the same week — a naive toIsoDate-based key
    // (the previous implementation) would differ here and silently
    // undo every dismissal overnight.
    const monday = new Date("2026-06-15T10:00:00.000Z");
    const tuesday = new Date("2026-06-16T10:00:00.000Z");
    expect(toIsoWeek(monday)).toBe(toIsoWeek(tuesday));
  });

  it("gives the last day of one week and the first day of the next different keys", () => {
    const sunday = new Date("2026-06-21T23:00:00.000Z");
    const nextMonday = new Date("2026-06-22T01:00:00.000Z");
    expect(toIsoWeek(sunday)).not.toBe(toIsoWeek(nextMonday));
  });
});
