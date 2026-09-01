import { describe, expect, it } from "vitest";
import {
  MIN_TREATMENT_IMPACT_DAYS,
  TREATMENT_IMPACT_WINDOW_DAYS,
  buildTreatmentImpact,
  computeTreatmentImpactWindows,
} from "../src/modules/treatments/treatment-impact.js";

function d(iso: string): Date {
  return new Date(iso);
}

describe("computeTreatmentImpactWindows", () => {
  it("'before' is always exactly windowDays ending at startDate, regardless of how long ago that was", () => {
    const { before } = computeTreatmentImpactWindows({
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2027-01-01"), // a year after startDate
    });
    expect(before.from.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(before.to.toISOString().slice(0, 10)).toBe("2026-06-15");
  });

  it("'after' runs from startDate to today for an ongoing treatment, capped at windowDays", () => {
    const { after } = computeTreatmentImpactWindows({
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2026-06-20"), // 5 days in — not yet at the 14-day cap
    });
    expect(after.from.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(after.to.toISOString().slice(0, 10)).toBe("2026-06-20");
  });

  it("'after' is capped at windowDays for a long-ongoing treatment, not left open-ended", () => {
    const { after } = computeTreatmentImpactWindows({
      startDate: d("2026-01-01"),
      endDate: null,
      today: d("2027-01-01"), // a year of ongoing use
    });
    expect(after.from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(after.to.toISOString().slice(0, 10)).toBe("2026-01-15"); // startDate + 14 days
  });

  it("'after' stops at endDate for a treatment that already ended, even inside the windowDays cap", () => {
    const { after } = computeTreatmentImpactWindows({
      startDate: d("2026-06-15"),
      endDate: d("2026-06-19"), // ended after only 4 days
      today: d("2026-07-01"),
    });
    expect(after.from.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(after.to.toISOString().slice(0, 10)).toBe("2026-06-19");
  });

  it("'after' never goes negative for a same-day start and end", () => {
    const { after } = computeTreatmentImpactWindows({
      startDate: d("2026-06-15"),
      endDate: d("2026-06-15"),
      today: d("2026-07-01"),
    });
    expect(after.from.getTime()).toBe(after.to.getTime());
  });

  it("respects a custom windowDays override", () => {
    const { before, after } = computeTreatmentImpactWindows({
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2027-01-01"),
      windowDays: 7,
    });
    expect(before.from.toISOString().slice(0, 10)).toBe("2026-06-08");
    expect(after.to.toISOString().slice(0, 10)).toBe("2026-06-22");
  });
});

describe("buildTreatmentImpact", () => {
  it("returns log counts and day-spans for both windows", () => {
    const impact = buildTreatmentImpact({
      treatmentId: "t1",
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2026-07-01"), // 16 days in, past the 14-day cap
      beforeLogCount: 5,
      afterLogCount: 2,
    });

    expect(impact.treatmentId).toBe("t1");
    expect(impact.windowDays).toBe(TREATMENT_IMPACT_WINDOW_DAYS);
    expect(impact.before).toEqual({ logCount: 5, days: 14 });
    expect(impact.after).toEqual({ logCount: 2, days: 14 });
    expect(impact.insufficientData).toBe(false);
  });

  it("flags insufficientData when the 'after' window hasn't run long enough yet", () => {
    const impact = buildTreatmentImpact({
      treatmentId: "t1",
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2026-06-16"), // only 1 day elapsed
      beforeLogCount: 5,
      afterLogCount: 0,
    });

    expect(impact.after.days).toBe(1);
    expect(impact.after.days).toBeLessThan(MIN_TREATMENT_IMPACT_DAYS);
    expect(impact.insufficientData).toBe(true);
  });

  it("does not flag insufficientData right at the MIN_TREATMENT_IMPACT_DAYS threshold", () => {
    const impact = buildTreatmentImpact({
      treatmentId: "t1",
      startDate: d("2026-06-15"),
      endDate: null,
      today: new Date(d("2026-06-15").getTime() + MIN_TREATMENT_IMPACT_DAYS * 86_400_000),
      beforeLogCount: 0,
      afterLogCount: 0,
    });

    expect(impact.after.days).toBe(MIN_TREATMENT_IMPACT_DAYS);
    expect(impact.insufficientData).toBe(false);
  });

  it("handles a treatment with zero logs on both sides honestly, not as an error", () => {
    const impact = buildTreatmentImpact({
      treatmentId: "t1",
      startDate: d("2026-06-15"),
      endDate: null,
      today: d("2026-07-01"),
      beforeLogCount: 0,
      afterLogCount: 0,
    });

    expect(impact.before.logCount).toBe(0);
    expect(impact.after.logCount).toBe(0);
    expect(impact.insufficientData).toBe(false);
  });
});
