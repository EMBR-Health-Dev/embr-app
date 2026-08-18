import { describe, expect, it } from "vitest";
import { toIsoDate } from "./date-format";

describe("toIsoDate", () => {
  it("formats a date as YYYY-MM-DD with zero-padding", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  it("uses the local calendar date, not a UTC-shifted one — the actual bug this function exists to prevent", () => {
    // 11:30pm local time — a UTC conversion (date.toISOString()) would
    // push this into the next day for any timezone behind UTC, which
    // is exactly the wrong-day bug a naive implementation would hit.
    const lateEvening = new Date(2026, 5, 15, 23, 30);
    expect(toIsoDate(lateEvening)).toBe("2026-06-15");
  });

  it("uses the local calendar date for a time just after midnight too", () => {
    const justAfterMidnight = new Date(2026, 5, 15, 0, 15);
    expect(toIsoDate(justAfterMidnight)).toBe("2026-06-15");
  });
});
