import { describe, expect, it } from "vitest";
import { timelineAxis, treatmentDuration } from "./treatment-span";

describe("treatmentDuration", () => {
  it("says days under two months, months under two years, then years, counting both ends", () => {
    expect(
      treatmentDuration({ startDate: "2026-10-01", endDate: "2026-10-01" }, "2026-10-26"),
    ).toEqual({ unit: "days", count: 1 });
    expect(treatmentDuration({ startDate: "2026-09-01", endDate: null }, "2026-10-26")).toEqual({
      unit: "days",
      count: 56,
    });
    expect(
      treatmentDuration({ startDate: "2026-03-01", endDate: "2026-05-15" }, "2026-10-26"),
    ).toEqual({ unit: "months", count: 2 });
    expect(treatmentDuration({ startDate: "2023-01-10", endDate: null }, "2026-10-26")).toEqual({
      unit: "years",
      count: 3,
    });
  });
});

describe("timelineAxis", () => {
  it("starts on the first of the earliest start's month and ends today", () => {
    const axis = timelineAxis(["2026-06-15", "2026-03-20"], "2026-10-26");
    expect(axis.start).toBe("2026-03-01");
    expect(axis.at("2026-03-01")).toBe(0);
    expect(axis.at("2026-10-26")).toBe(1);
    expect(axis.ticks.every((tick) => tick.label === "month")).toBe(true);
    expect(axis.ticks.length).toBeLessThanOrEqual(8);
  });

  it("shows at least three months, and switches to years for long histories", () => {
    expect(timelineAxis(["2026-10-20"], "2026-10-26").start).toBe("2026-07-01");
    const long = timelineAxis(["2023-05-01"], "2026-10-26");
    expect(long.ticks.map((tick) => tick.date)).toEqual(["2024-01-01", "2025-01-01", "2026-01-01"]);
  });
});
