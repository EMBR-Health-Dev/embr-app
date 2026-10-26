import { describe, expect, it } from "vitest";
import { detectSymptomCoOccurrence } from "../src/modules/trends/co-occurrence.js";
import { detectSymptomContextCoOccurrence } from "../src/modules/trends/context-co-occurrence.js";
import { groupLogDatesByCategory } from "../src/modules/briefs/period-comparison.js";
import { computeLoggingActivity } from "../src/modules/reflections/reflection-engine.js";
import { resolveTimeZone } from "../src/modules/trends/symptom-history.js";
import { calendarDateBounds } from "../src/lib/local-day-label.js";

const at = (iso: string) => new Date(iso);

// Tokyo is UTC+9: 07:30 local on 2 October is 22:30 UTC on 1 October.
const TOKYO_MORNING_HOT_FLASHES = [
  { category: "HOT_FLASH" as const, occurredAt: at("2026-10-01T22:30:00Z") },
  { category: "HOT_FLASH" as const, occurredAt: at("2026-10-02T22:30:00Z") },
  { category: "HOT_FLASH" as const, occurredAt: at("2026-10-03T22:30:00Z") },
];
// 20:00 local on 2, 3 and 4 October.
const TOKYO_EVENING_FATIGUE = [
  { category: "FATIGUE" as const, occurredAt: at("2026-10-02T11:00:00Z") },
  { category: "FATIGUE" as const, occurredAt: at("2026-10-03T11:00:00Z") },
  { category: "FATIGUE" as const, occurredAt: at("2026-10-04T11:00:00Z") },
];

describe("symptom days are her local days when a time zone is given", () => {
  it("finds a morning and evening symptom on the same Tokyo days", () => {
    const logs = [...TOKYO_MORNING_HOT_FLASHES, ...TOKYO_EVENING_FATIGUE];
    expect(detectSymptomCoOccurrence(logs, "Asia/Tokyo")).toEqual({
      categoryA: "FATIGUE",
      categoryB: "HOT_FLASH",
      days: 3,
      dates: ["2026-10-02", "2026-10-03", "2026-10-04"],
    });
    // UTC days split each morning onto the day before: only two shared.
    expect(detectSymptomCoOccurrence(logs)).toBeNull();
  });

  it("pairs a Pago Pago evening symptom with that evening's context answer", () => {
    // Pago Pago is UTC-11: 20:00 local on 5 October is 07:00 UTC on 6 October.
    const symptoms = ["05", "06", "07"].map((d) => ({
      category: "HOT_FLASH" as const,
      occurredAt: new Date(new Date(`2026-10-${d}T20:00:00-11:00`).toISOString()),
    }));
    const context = ["05", "06", "07"].map((d) => ({
      date: at(`2026-10-${d}T00:00:00Z`),
      sleepDuration: null,
      caffeineAfternoon: null,
      alcohol: true,
      stressLevel: null,
    }));
    expect(detectSymptomContextCoOccurrence(symptoms, context, "Pacific/Pago_Pago")).toMatchObject({
      category: "HOT_FLASH",
      factor: "ALCOHOL",
      days: 3,
      dates: ["2026-10-05", "2026-10-06", "2026-10-07"],
    });
    // On UTC days every symptom lands a day after its context answer.
    expect(detectSymptomContextCoOccurrence(symptoms, context)).toBeNull();
  });

  it("lists BRIEF dates on the Tokyo day the entry was made", () => {
    expect(
      groupLogDatesByCategory(TOKYO_MORNING_HOT_FLASHES, "Asia/Tokyo").get("HOT_FLASH"),
    ).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("counts a New York evening and the next UTC morning as one day logged", () => {
    // 08:00 and 21:00 local on 1 October; 21:00 EDT is 01:00 UTC on 2 October.
    const logs = [
      { occurredAt: at("2026-10-01T12:00:00Z") },
      { occurredAt: at("2026-10-02T01:00:00Z") },
      { occurredAt: at("2026-10-02T01:30:00Z") },
    ];
    expect(computeLoggingActivity(logs, "America/New_York")).toEqual({
      logCount: 3,
      daysLogged: 1,
    });
    expect(computeLoggingActivity(logs)).toEqual({ logCount: 3, daysLogged: 2 });
  });
});

describe("resolveTimeZone", () => {
  it("defaults to UTC, keeps a real zone and refuses an unknown one", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
    expect(resolveTimeZone("Europe/London")).toBe("Europe/London");
    expect(() => resolveTimeZone("Mars/Olympus_Mons")).toThrow(/Unknown time zone/);
  });
});

describe("calendarDateBounds with her time zone", () => {
  it("gets Auckland's daylight time (UTC+13) right, which the 12 hour rule cannot", () => {
    // 1 to 31 October in Auckland, as its browser sends them.
    const range = { from: at("2026-09-30T11:00:00.000Z"), to: at("2026-10-31T10:59:59.999Z") };
    expect(calendarDateBounds({ ...range, timeZone: "Pacific/Auckland" })).toEqual({
      from: at("2026-10-01T00:00:00.000Z"),
      to: at("2026-10-31T00:00:00.000Z"),
    });
    // Without the zone, the start lands a day early: the documented limit.
    expect(calendarDateBounds(range).from).toEqual(at("2026-09-30T00:00:00.000Z"));
  });
});
