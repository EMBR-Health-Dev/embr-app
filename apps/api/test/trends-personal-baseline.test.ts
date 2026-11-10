import { describe, expect, it } from "vitest";
import type { SymptomCategory } from "@embr/types";
import {
  BASELINE_WEEKS,
  MIN_BASELINE_WEEKS,
  computePersonalBaseline,
} from "../src/modules/trends/personal-baseline.js";

const NOW = new Date("2026-11-10T12:00:00Z"); // a Tuesday; today = 2026-11-10

function at(date: string, hour = 12) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** n days of `category` at the start of the 7-day block k weeks back (0 = this week). */
function block(category: SymptomCategory, k: number, n: number) {
  const blockEnd = addDays("2026-11-10", -7 * k);
  return Array.from({ length: n }, (_, i) => ({
    category,
    occurredAt: at(addDays(blockEnd, -i)),
  }));
}

describe("computePersonalBaseline", () => {
  it("compares this week with the median of her recent active weeks", () => {
    const logs = [
      ...block("NIGHT_SWEATS", 0, 5),
      ...block("NIGHT_SWEATS", 1, 2),
      ...block("NIGHT_SWEATS", 2, 1),
      ...block("NIGHT_SWEATS", 3, 3),
      ...block("NIGHT_SWEATS", 4, 2),
      ...block("HOT_FLASH", 0, 2),
      ...block("HOT_FLASH", 1, 2),
      ...block("HOT_FLASH", 2, 2),
      ...block("HOT_FLASH", 3, 2),
      ...block("HOT_FLASH", 4, 2),
    ];
    const result = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });

    expect(result.thisWeek).toEqual({ from: "2026-11-04", to: "2026-11-10" });
    expect(result.enoughHistory).toBe(true);
    expect(result.baselineWeeks).toBe(4);
    // Night sweats: this week 5, usual median(2,1,3,2) = 2. Biggest gap first.
    expect(result.items).toEqual([
      { category: "NIGHT_SWEATS", thisWeekDays: 5, usualWeekDays: 2 },
      { category: "HOT_FLASH", thisWeekDays: 2, usualWeekDays: 2 },
    ]);
  });

  it("does not count weeks she recorded nothing in as zero", () => {
    // Active in blocks 1, 2, 5, 7 only; blocks 3, 4, 6, 8 are empty.
    const logs = [
      ...block("FATIGUE", 1, 4),
      ...block("FATIGUE", 2, 4),
      ...block("FATIGUE", 5, 4),
      ...block("FATIGUE", 7, 4),
    ];
    const result = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.baselineWeeks).toBe(4);
    expect(result.items).toEqual([{ category: "FATIGUE", thisWeekDays: 0, usualWeekDays: 4 }]);
  });

  it("counts a week with only context answers as active, so a symptom-free week is a real zero", () => {
    const logs = [
      ...block("BRAIN_FOG", 1, 2),
      ...block("BRAIN_FOG", 2, 2),
      ...block("BRAIN_FOG", 3, 2),
    ];
    const contextDates = [addDays("2026-11-10", -7 * 4)];
    const result = computePersonalBaseline({
      symptomLogs: logs,
      contextDates,
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.baselineWeeks).toBe(4);
    // median(2,2,2,0) = 2
    expect(result.items).toEqual([{ category: "BRAIN_FOG", thisWeekDays: 0, usualWeekDays: 2 }]);
  });

  it("gives no usual week until there are enough active weeks", () => {
    const logs = [
      ...block("HOT_FLASH", 0, 3),
      ...block("HOT_FLASH", 1, 1),
      ...block("HOT_FLASH", 2, 1),
    ];
    const result = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.enoughHistory).toBe(false);
    expect(result.baselineWeeks).toBe(2);
    expect(result.minBaselineWeeks).toBe(MIN_BASELINE_WEEKS);
    expect(result.items).toEqual([]);
  });

  it("looks back no further than BASELINE_WEEKS", () => {
    const logs = Array.from({ length: BASELINE_WEEKS + 3 }, (_, k) =>
      block("HOT_FLASH", k + 1, 1),
    ).flat();
    const result = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.baselineWeeks).toBe(BASELINE_WEEKS);
  });

  it("uses her local day, so a late-evening entry lands on the right week", () => {
    // 2026-11-03 23:30 in New York is 2026-11-04 04:30 UTC: this week in UTC,
    // last week in New York.
    const logs = [
      { category: "HOT_FLASH" as const, occurredAt: new Date("2026-11-04T04:30:00Z") },
      ...block("HOT_FLASH", 2, 1),
      ...block("HOT_FLASH", 3, 1),
      ...block("HOT_FLASH", 4, 1),
      ...block("HOT_FLASH", 5, 1),
    ];
    const ny = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "America/New_York",
      now: NOW,
    });
    const utc = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    expect(ny.items[0]!.thisWeekDays).toBe(0);
    expect(utc.items[0]!.thisWeekDays).toBe(1);
  });

  it("gives the same answer whatever order the rows come in", () => {
    const logs = [
      ...block("NIGHT_SWEATS", 0, 4),
      ...block("MOOD_CHANGE", 0, 1),
      ...[1, 2, 3, 4].flatMap((k) => [
        ...block("NIGHT_SWEATS", k, 1),
        ...block("MOOD_CHANGE", k, 4),
      ]),
    ];
    const a = computePersonalBaseline({
      symptomLogs: logs,
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    const b = computePersonalBaseline({
      symptomLogs: [...logs].reverse(),
      contextDates: [],
      timeZone: "UTC",
      now: NOW,
    });
    expect(a).toEqual(b);
    // Equal gaps (3 each): alphabetical.
    expect(a.items.map((i) => i.category)).toEqual(["MOOD_CHANGE", "NIGHT_SWEATS"]);
  });
});
