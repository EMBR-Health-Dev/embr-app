import { describe, expect, it } from "vitest";
import { formatRate, formatWeek, ofTotal } from "./metrics-format";

describe("metrics formatting", () => {
  it("shows a rate as a whole percent, or a dash with no cohort", () => {
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(0.333)).toBe("33%");
    expect(formatRate(null)).toBe("—");
  });

  it("shows a week start as a short UTC date", () => {
    expect(formatWeek("2026-10-05")).toBe("Oct 5");
  });

  it("shows a part of a total", () => {
    expect(ofTotal(12, 40)).toBe("12 of 40");
  });
});
