import { describe, expect, it } from "vitest";
import type { SeverityLevel, SymptomCategory } from "@embr/types";
import {
  addDaysToIsoDate,
  computeSymptomHistory,
  isValidTimeZone,
  localDate,
} from "../src/modules/trends/symptom-history.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function log(category: SymptomCategory, isoDate: string, severity: SeverityLevel = "MILD") {
  return { category, severity, occurredAt: new Date(`${isoDate}T12:00:00.000Z`) };
}

/** One MILD log per day for `count` consecutive days ending `endDaysAgo` days before NOW. */
function run(category: SymptomCategory, endDaysAgo: number, count: number) {
  return Array.from({ length: count }, (_, i) =>
    log(category, addDaysToIsoDate("2026-10-01", -(endDaysAgo + i))),
  );
}

describe("localDate / isValidTimeZone / addDaysToIsoDate", () => {
  it("assigns an instant to the calendar day of the given time zone", () => {
    const instant = new Date("2026-01-01T23:30:00.000Z");
    expect(localDate(instant, "UTC")).toBe("2026-01-01");
    expect(localDate(instant, "Asia/Tokyo")).toBe("2026-01-02");
    expect(localDate(instant, "America/New_York")).toBe("2026-01-01");
  });

  it("validates IANA zones", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });

  it("does calendar arithmetic across month and year ends", () => {
    expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToIsoDate("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("computeSymptomHistory", () => {
  it("returns no categories for an empty record and defaults the range to the last 90 days", () => {
    const result = computeSymptomHistory({ logs: [], timeZone: "UTC", now: NOW });
    expect(result.categories).toEqual([]);
    expect(result.today).toBe("2026-10-01");
    expect(result.rangeFrom).toBe("2026-07-04");
    expect(result.rangeTo).toBe("2026-10-01");
    expect(result.rules).toEqual({ notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 });
  });

  it("collapses several entries on one day to one day at the highest severity", () => {
    const result = computeSymptomHistory({
      logs: [
        log("HOT_FLASH", "2026-09-30", "MILD"),
        log("HOT_FLASH", "2026-09-30", "SEVERE"),
        log("HOT_FLASH", "2026-09-30", "MODERATE"),
      ],
      timeZone: "UTC",
      now: NOW,
    });
    const [hot] = result.categories;
    expect(hot!.totalEntries).toBe(3);
    expect(hot!.totalDaysLogged).toBe(1);
    expect(hot!.days).toEqual([{ date: "2026-09-30", maxSeverity: "SEVERE", entries: 3 }]);
    expect(hot!.rangeSeverityDays).toEqual({ MILD: 0, MODERATE: 0, SEVERE: 1 });
  });

  it("counts days logged in the last 7 and last 42 days, today included", () => {
    // Every day from 59 days ago to today: 60 days.
    const result = computeSymptomHistory({
      logs: run("FATIGUE", 0, 60),
      timeZone: "UTC",
      now: NOW,
    });
    const [fatigue] = result.categories;
    expect(fatigue!.daysLoggedLast7).toBe(7);
    expect(fatigue!.daysLoggedLast42).toBe(42);
    expect(fatigue!.totalDaysLogged).toBe(60);
    expect(fatigue!.firstLoggedOn).toBe("2026-08-03");
    expect(fatigue!.lastLoggedOn).toBe("2026-10-01");
  });

  it("flags a symptom as not logged recently only when other symptoms are still being logged", () => {
    const brainFog = run("BRAIN_FOG", 30, 10); // last logged 30 days ago
    const quietRecord = computeSymptomHistory({ logs: brainFog, timeZone: "UTC", now: NOW });
    // Nothing logged at all in the last 21 days: the person may simply
    // have stopped logging, so nothing is flagged.
    expect(quietRecord.categories[0]!.notLoggedRecently).toBe(false);

    const activeRecord = computeSymptomHistory({
      logs: [...brainFog, log("HOT_FLASH", "2026-09-29")],
      timeZone: "UTC",
      now: NOW,
    });
    const fog = activeRecord.categories.find((c) => c.category === "BRAIN_FOG")!;
    expect(fog.notLoggedRecently).toBe(true);
    expect(activeRecord.categories.find((c) => c.category === "HOT_FLASH")!.notLoggedRecently).toBe(
      false,
    );
  });

  it("does not flag a symptom with fewer than 3 logged days before the gap", () => {
    const result = computeSymptomHistory({
      logs: [...run("BRAIN_FOG", 30, 2), log("HOT_FLASH", "2026-09-29")],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.categories.find((c) => c.category === "BRAIN_FOG")!.notLoggedRecently).toBe(
      false,
    );
  });

  it("treats exactly 21 days ago as outside the gap and 20 days ago as inside it", () => {
    const base = [log("HOT_FLASH", "2026-09-29")];
    const at21 = computeSymptomHistory({
      logs: [...base, ...run("BRAIN_FOG", 21, 5)],
      timeZone: "UTC",
      now: NOW,
    });
    expect(at21.categories.find((c) => c.category === "BRAIN_FOG")!.notLoggedRecently).toBe(true);
    const at20 = computeSymptomHistory({
      logs: [...base, ...run("BRAIN_FOG", 20, 5)],
      timeZone: "UTC",
      now: NOW,
    });
    expect(at20.categories.find((c) => c.category === "BRAIN_FOG")!.notLoggedRecently).toBe(false);
  });

  it("limits calendar days and range counts to the range, but keeps whole-record figures", () => {
    const result = computeSymptomHistory({
      logs: [log("HOT_FLASH", "2025-07-01"), log("HOT_FLASH", "2026-09-15", "MODERATE")],
      timeZone: "UTC",
      now: NOW,
      rangeFrom: "2026-09-01",
      rangeTo: "2026-09-30",
    });
    const [hot] = result.categories;
    expect(hot!.firstLoggedOn).toBe("2025-07-01");
    expect(hot!.totalDaysLogged).toBe(2);
    expect(hot!.rangeDaysLogged).toBe(1);
    expect(hot!.rangeEntries).toBe(1);
    expect(hot!.days.map((d) => d.date)).toEqual(["2026-09-15"]);
  });

  it("keeps a category with entries only outside the range, with no calendar days", () => {
    const result = computeSymptomHistory({
      logs: [log("JOINT_PAIN", "2025-07-01")],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.categories[0]!.rangeDaysLogged).toBe(0);
    expect(result.categories[0]!.days).toEqual([]);
  });

  it("ignores future-dated entries", () => {
    const result = computeSymptomHistory({
      logs: [log("HOT_FLASH", "2026-10-05"), log("HOT_FLASH", "2026-09-30")],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.categories[0]!.totalEntries).toBe(1);
    expect(result.categories[0]!.lastLoggedOn).toBe("2026-09-30");
  });

  it("orders by days logged in range, then whole record, then category id", () => {
    const result = computeSymptomHistory({
      logs: [
        ...run("SLEEP_DISTURBANCE", 0, 2),
        ...run("HOT_FLASH", 0, 5),
        ...run("FATIGUE", 0, 2),
        log("FATIGUE", "2025-01-01"),
        ...run("BRAIN_FOG", 0, 2),
      ],
      timeZone: "UTC",
      now: NOW,
    });
    expect(result.categories.map((c) => c.category)).toEqual([
      "HOT_FLASH",
      "FATIGUE",
      "BRAIN_FOG",
      "SLEEP_DISTURBANCE",
    ]);
  });

  it("is deterministic for the same input", () => {
    const logs = [...run("HOT_FLASH", 0, 12), ...run("BRAIN_FOG", 25, 6)];
    const a = computeSymptomHistory({ logs, timeZone: "Europe/Paris", now: NOW });
    const b = computeSymptomHistory({
      logs: [...logs].reverse(),
      timeZone: "Europe/Paris",
      now: NOW,
    });
    expect(a).toEqual(b);
  });
});
