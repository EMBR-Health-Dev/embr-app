import { describe, expect, it } from "vitest";
import {
  detectSymptomContextCoOccurrence,
  type ContextLogRow,
} from "../src/modules/trends/context-co-occurrence.js";
import { MIN_CO_OCCURRENCE_DAYS } from "../src/modules/trends/co-occurrence.js";

function symptomLog(category: string, isoDate: string) {
  return { category: category as never, occurredAt: new Date(isoDate) };
}

function contextLog(isoDate: string, fields: Partial<Omit<ContextLogRow, "date">> = {}) {
  return {
    date: new Date(isoDate),
    sleepDuration: fields.sleepDuration ?? null,
    caffeineAfternoon: fields.caffeineAfternoon ?? null,
    alcohol: fields.alcohol ?? null,
    stressLevel: fields.stressLevel ?? null,
  };
}

describe("detectSymptomContextCoOccurrence", () => {
  it("returns the symptom/factor pair when co-occurrence meets the threshold", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { caffeineAfternoon: true }),
      contextLog("2026-01-02", { caffeineAfternoon: true }),
      contextLog("2026-01-03", { caffeineAfternoon: true }),
    ];

    expect(detectSymptomContextCoOccurrence(symptomLogs, contextLogs)).toEqual({
      category: "HOT_FLASH",
      factor: "CAFFEINE_AFTERNOON",
      days: 3,
      dates: ["2026-01-01", "2026-01-02", "2026-01-03"],
    });
  });

  it("returns null when nothing overlaps", () => {
    const symptomLogs = [symptomLog("HOT_FLASH", "2026-01-01")];
    const contextLogs = [contextLog("2026-02-01", { alcohol: true })];

    expect(detectSymptomContextCoOccurrence(symptomLogs, contextLogs)).toBeNull();
  });

  it("returns null for an empty dataset", () => {
    expect(detectSymptomContextCoOccurrence([], [])).toBeNull();
  });

  it("does not qualify one day below the threshold", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { alcohol: true }),
      contextLog("2026-01-02", { alcohol: true }),
    ];

    expect(detectSymptomContextCoOccurrence(symptomLogs, contextLogs)).toBeNull();
  });

  it("qualifies at exactly the threshold", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { stressLevel: "HIGH" }),
      contextLog("2026-01-02", { stressLevel: "HIGH" }),
      contextLog("2026-01-03", { stressLevel: "HIGH" }),
    ];

    const result = detectSymptomContextCoOccurrence(symptomLogs, contextLogs);
    expect(result?.days).toBe(MIN_CO_OCCURRENCE_DAYS);
    expect(result?.factor).toBe("HIGH_STRESS");
  });

  describe("factor rules — exactly one qualifying value per factor, nothing else", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
    ];

    it("SHORT_SLEEP requires sleepDuration === UNDER_6H, not the other buckets", () => {
      const qualifying = [
        contextLog("2026-01-01", { sleepDuration: "UNDER_6H" }),
        contextLog("2026-01-02", { sleepDuration: "UNDER_6H" }),
        contextLog("2026-01-03", { sleepDuration: "UNDER_6H" }),
      ];
      expect(detectSymptomContextCoOccurrence(symptomLogs, qualifying)?.factor).toBe("SHORT_SLEEP");

      const nonQualifying = [
        contextLog("2026-01-01", { sleepDuration: "SIX_TO_SEVEN_H" }),
        contextLog("2026-01-02", { sleepDuration: "SEVEN_PLUS_H" }),
        contextLog("2026-01-03", { sleepDuration: "SIX_TO_SEVEN_H" }),
      ];
      expect(detectSymptomContextCoOccurrence(symptomLogs, nonQualifying)).toBeNull();
    });

    it("CAFFEINE_AFTERNOON requires caffeineAfternoon === true, not false", () => {
      const nonQualifying = [
        contextLog("2026-01-01", { caffeineAfternoon: false }),
        contextLog("2026-01-02", { caffeineAfternoon: false }),
        contextLog("2026-01-03", { caffeineAfternoon: false }),
      ];
      expect(detectSymptomContextCoOccurrence(symptomLogs, nonQualifying)).toBeNull();
    });

    it("ALCOHOL requires alcohol === true, not false", () => {
      const nonQualifying = [
        contextLog("2026-01-01", { alcohol: false }),
        contextLog("2026-01-02", { alcohol: false }),
        contextLog("2026-01-03", { alcohol: false }),
      ];
      expect(detectSymptomContextCoOccurrence(symptomLogs, nonQualifying)).toBeNull();
    });

    it("HIGH_STRESS requires stressLevel === HIGH, not LOW or MODERATE", () => {
      const nonQualifying = [
        contextLog("2026-01-01", { stressLevel: "LOW" }),
        contextLog("2026-01-02", { stressLevel: "MODERATE" }),
        contextLog("2026-01-03", { stressLevel: "LOW" }),
      ];
      expect(detectSymptomContextCoOccurrence(symptomLogs, nonQualifying)).toBeNull();
    });
  });

  it("a single context log can qualify for multiple factors at once on the same day", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { alcohol: true, stressLevel: "HIGH" }),
      contextLog("2026-01-02", { alcohol: true, stressLevel: "HIGH" }),
      contextLog("2026-01-03", { alcohol: true, stressLevel: "HIGH" }),
    ];

    // Both ALCOHOL and HIGH_STRESS qualify at 3 days each; alphabetical
    // tie-break (ALCOHOL < HIGH_STRESS) picks ALCOHOL, matching the
    // same "first-encountered-wins-on-tie" determinism as
    // detectSymptomCoOccurrence.
    expect(detectSymptomContextCoOccurrence(symptomLogs, contextLogs)?.factor).toBe("ALCOHOL");
  });

  it("selects the strongest-overlap pair when multiple symptom/factor pairs qualify", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
      symptomLog("FATIGUE", "2026-02-01"),
      symptomLog("FATIGUE", "2026-02-02"),
      symptomLog("FATIGUE", "2026-02-03"),
      symptomLog("FATIGUE", "2026-02-04"),
      symptomLog("FATIGUE", "2026-02-05"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { alcohol: true }),
      contextLog("2026-01-02", { alcohol: true }),
      contextLog("2026-01-03", { alcohol: true }),
      contextLog("2026-02-01", { sleepDuration: "UNDER_6H" }),
      contextLog("2026-02-02", { sleepDuration: "UNDER_6H" }),
      contextLog("2026-02-03", { sleepDuration: "UNDER_6H" }),
      contextLog("2026-02-04", { sleepDuration: "UNDER_6H" }),
      contextLog("2026-02-05", { sleepDuration: "UNDER_6H" }),
    ];

    expect(detectSymptomContextCoOccurrence(symptomLogs, contextLogs)).toEqual({
      category: "FATIGUE",
      factor: "SHORT_SLEEP",
      days: 5,
      dates: ["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"],
    });
  });

  it("counts multiple context logs is impossible per day (unique by date) but multiple symptom logs on one day still count once", () => {
    const symptomLogs = [
      symptomLog("HOT_FLASH", "2026-01-01T06:00:00.000Z"),
      symptomLog("HOT_FLASH", "2026-01-01T20:00:00.000Z"),
      symptomLog("HOT_FLASH", "2026-01-02"),
      symptomLog("HOT_FLASH", "2026-01-03"),
    ];
    const contextLogs = [
      contextLog("2026-01-01", { alcohol: true }),
      contextLog("2026-01-02", { alcohol: true }),
      contextLog("2026-01-03", { alcohol: true }),
    ];

    const result = detectSymptomContextCoOccurrence(symptomLogs, contextLogs);
    expect(result?.days).toBe(3);
    expect(result?.dates).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});
