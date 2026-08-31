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
