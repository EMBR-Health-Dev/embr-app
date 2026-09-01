import { afterEach, describe, expect, it } from "vitest";
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

  describe("across real timezones (regression proof, independent of the CI runner's own TZ)", () => {
    const originalTz = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it("returns the JST calendar date even while UTC's own date hasn't rolled over yet", () => {
      // 2026-06-01T20:00:00Z is 2026-06-02T05:00:00 in JST (UTC+9) — a
      // JST user's own "today" is already June 2nd here, while UTC's
      // calendar date is still June 1st. new Date().toISOString()
      // would return the wrong (UTC) day for this exact case; a
      // date-only input's max/default computed that way would then
      // disagree with what the user sees on their own device.
      process.env.TZ = "Asia/Tokyo";
      const instant = new Date("2026-06-01T20:00:00Z");
      expect(toIsoDate(instant)).toBe("2026-06-02");
    });

    it("returns the Pacific calendar date even while UTC's own date has already rolled over", () => {
      // 2026-06-01T20:00:00Z is 2026-06-01T13:00:00 in Los Angeles
      // (UTC-8 with DST → UTC-7) — still June 1st locally.
      process.env.TZ = "America/Los_Angeles";
      const instant = new Date("2026-06-01T20:00:00Z");
      expect(toIsoDate(instant)).toBe("2026-06-01");
    });
  });
});
