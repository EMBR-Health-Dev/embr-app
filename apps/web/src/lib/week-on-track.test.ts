import { describe, expect, it } from "vitest";
import {
  buildWeek,
  daysWithEntries,
  highestSeverityByDay,
  lastSevenDates,
  todaySteps,
} from "./week-on-track";

describe("lastSevenDates", () => {
  it("returns seven local dates ending today, oldest first", () => {
    expect(lastSevenDates(new Date(2026, 9, 12, 15, 0))).toEqual([
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);
  });
});

describe("buildWeek", () => {
  const dates = ["2026-10-10", "2026-10-11", "2026-10-12"];

  it("marks each kind of entry on its own day and ignores dates outside the week", () => {
    const week = buildWeek(
      dates,
      [new Date(2026, 9, 10, 9, 30).toISOString(), new Date(2026, 9, 12, 22, 0).toISOString()],
      ["2026-10-11", "2026-10-09"],
      ["2026-10-12"],
    );
    expect(week).toEqual([
      { date: "2026-10-10", symptoms: true, context: false, cycle: false },
      { date: "2026-10-11", symptoms: false, context: true, cycle: false },
      { date: "2026-10-12", symptoms: true, context: false, cycle: true },
    ]);
    expect(daysWithEntries(week)).toBe(3);
  });

  it("counts a day with nothing as empty", () => {
    expect(daysWithEntries(buildWeek(dates, [], [], []))).toBe(0);
  });
});

describe("todaySteps", () => {
  const empty = { date: "2026-10-12", symptoms: false, context: false, cycle: false };

  it("lists check in, context and an optional cycle entry", () => {
    expect(
      todaySteps({ today: empty, appointmentSoon: false, latestBriefCreatedAt: null }),
    ).toEqual([
      { key: "symptoms", done: false, optional: false },
      { key: "context", done: false, optional: false },
      { key: "cycle", done: false, optional: true },
    ]);
  });

  it("marks steps done from what was recorded today", () => {
    const steps = todaySteps({
      today: { ...empty, symptoms: true, context: true },
      appointmentSoon: false,
      latestBriefCreatedAt: null,
    });
    expect(steps.map((s) => s.done)).toEqual([true, true, false]);
  });

  it("adds the BRIEF step only when an appointment is within a month", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const without = todaySteps({
      today: empty,
      appointmentSoon: true,
      latestBriefCreatedAt: null,
      now,
    });
    expect(without.at(-1)).toEqual({ key: "brief", done: false, optional: false });

    const recent = todaySteps({
      today: empty,
      appointmentSoon: true,
      latestBriefCreatedAt: "2026-10-05T12:00:00Z",
      now,
    });
    expect(recent.at(-1)?.done).toBe(true);

    const old = todaySteps({
      today: empty,
      appointmentSoon: true,
      latestBriefCreatedAt: "2026-09-01T12:00:00Z",
      now,
    });
    expect(old.at(-1)?.done).toBe(false);
  });
});

describe("highestSeverityByDay", () => {
  it("keeps the most severe level logged on each local day", () => {
    const byDay = highestSeverityByDay([
      { occurredAt: "2026-10-20T08:00:00", severity: "MILD" },
      { occurredAt: "2026-10-20T19:00:00", severity: "SEVERE" },
      { occurredAt: "2026-10-20T21:00:00", severity: "MODERATE" },
      { occurredAt: "2026-10-21T09:00:00", severity: "MILD" },
    ]);
    expect(byDay.get("2026-10-20")).toBe("SEVERE");
    expect(byDay.get("2026-10-21")).toBe("MILD");
    expect(byDay.has("2026-10-22")).toBe(false);
  });
});
