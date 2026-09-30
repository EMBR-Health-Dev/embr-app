import { describe, expect, it } from "vitest";

import { briefPeriodLabel } from "../src/modules/briefs/brief-period-label.js";

// The web client's startOfLocalDay/endOfLocalDay for Sep 1 to Sep 30,
// computed by hand for each offset.
describe("briefPeriodLabel", () => {
  it("labels a Tokyo (UTC+9) local-day range with the picked dates", () => {
    expect(
      briefPeriodLabel(new Date("2026-08-31T15:00:00.000Z"), new Date("2026-09-30T14:59:59.999Z")),
    ).toEqual({ fromDate: "2026-09-01", toDate: "2026-09-30" });
  });

  it("labels a New York (UTC-4) local-day range with the picked dates", () => {
    expect(
      briefPeriodLabel(new Date("2026-09-01T04:00:00.000Z"), new Date("2026-10-01T03:59:59.999Z")),
    ).toEqual({ fromDate: "2026-09-01", toDate: "2026-09-30" });
  });

  it("labels a UTC local-day range with the picked dates", () => {
    expect(
      briefPeriodLabel(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-30T23:59:59.999Z")),
    ).toEqual({ fromDate: "2026-09-01", toDate: "2026-09-30" });
  });

  it("leaves plain dates (UTC midnight on both ends) on their own dates", () => {
    expect(briefPeriodLabel(new Date("2026-01-01"), new Date("2026-02-01"))).toEqual({
      fromDate: "2026-01-01",
      toDate: "2026-02-01",
    });
  });
});
