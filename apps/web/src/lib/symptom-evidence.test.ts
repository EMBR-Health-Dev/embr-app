import { describe, expect, it } from "vitest";
import type { SymptomHistoryCategoryDto } from "@embr/types";
import { calendarMonths, dayEvidence, symptomRecordState } from "./symptom-evidence";

function category(overrides: Partial<SymptomHistoryCategoryDto> = {}): SymptomHistoryCategoryDto {
  return {
    category: "BRAIN_FOG",
    firstLoggedOn: "2026-07-14",
    lastLoggedOn: "2026-09-30",
    totalEntries: 3,
    totalDaysLogged: 3,
    daysLoggedLast7: 1,
    daysLoggedLast42: 3,
    rangeEntries: 3,
    rangeDaysLogged: 3,
    rangeSeverityDays: { MILD: 1, MODERATE: 1, SEVERE: 1 },
    notLoggedRecently: false,
    days: [
      { date: "2026-09-28", maxSeverity: "MILD", entries: 1 },
      { date: "2026-09-30", maxSeverity: "SEVERE", entries: 2 },
    ],
    ...overrides,
  };
}

describe("symptomRecordState", () => {
  it("keeps the four symptom-level states apart", () => {
    expect(symptomRecordState(undefined)).toBe("no_history");
    expect(symptomRecordState(category())).toBe("logged_recently");
    expect(symptomRecordState(category({ daysLoggedLast7: 0, notLoggedRecently: true }))).toBe(
      "not_logged_recently",
    );
    expect(symptomRecordState(category({ daysLoggedLast7: 0 }))).toBe("logged_earlier");
  });
});

describe("dayEvidence", () => {
  it("reports a blank day between two logged days as no entry, never as a zero severity", () => {
    const history = category();
    expect(dayEvidence(history, "2026-09-28")).toEqual({
      state: "logged",
      date: "2026-09-28",
      maxSeverity: "MILD",
      entries: 1,
    });
    expect(dayEvidence(history, "2026-09-29")).toEqual({ state: "no_entry", date: "2026-09-29" });
    expect(dayEvidence(undefined, "2026-09-29")).toEqual({ state: "no_entry", date: "2026-09-29" });
  });
});

describe("calendarMonths", () => {
  it("lays out Monday-first weeks, newest month first, marking days outside the range", () => {
    const months = calendarMonths("2026-09-15", "2026-10-01");
    expect(months.map((m) => m.month)).toEqual(["2026-10", "2026-09"]);

    // 1 October 2026 is a Thursday: three blank cells before it.
    const october = months[0]!;
    expect(october.weeks[0]!.slice(0, 3)).toEqual([null, null, null]);
    expect(october.weeks[0]![3]).toEqual({ date: "2026-10-01", inRange: true });
    expect(october.weeks[0]![4]).toEqual({ date: "2026-10-02", inRange: false });
    expect(october.weeks.every((w) => w.length === 7)).toBe(true);

    const september = months[1]!.weeks.flat().filter((c) => c !== null);
    expect(september).toHaveLength(30);
    expect(september.find((c) => c!.date === "2026-09-14")!.inRange).toBe(false);
    expect(september.find((c) => c!.date === "2026-09-15")!.inRange).toBe(true);
  });

  it("crosses a year boundary", () => {
    expect(calendarMonths("2025-12-20", "2026-01-05").map((m) => m.month)).toEqual([
      "2026-01",
      "2025-12",
    ]);
  });
});
