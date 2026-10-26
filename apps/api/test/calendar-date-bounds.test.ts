import { describe, expect, it } from "vitest";
import { calendarDateBounds } from "../src/lib/local-day-label.js";

const iso = (bounds: { from?: Date; to?: Date }) => ({
  from: bounds.from?.toISOString(),
  to: bounds.to?.toISOString(),
});

describe("calendarDateBounds", () => {
  it("turns each zone's local 1 to 31 October into those two calendar dates", () => {
    const expected = { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" };
    for (const [from, to] of [
      ["2026-09-30T15:00:00.000Z", "2026-10-31T14:59:59.999Z"], // Tokyo
      ["2026-09-30T23:00:00.000Z", "2026-10-31T23:59:59.999Z"], // London, BST to GMT
      ["2026-10-01T04:00:00.000Z", "2026-11-01T03:59:59.999Z"], // New York
      ["2026-10-01T11:00:00.000Z", "2026-11-01T10:59:59.999Z"], // Pago Pago
      ["2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z"], // UTC
    ]) {
      expect(iso(calendarDateBounds({ from: new Date(from!), to: new Date(to!) }))).toEqual(
        expected,
      );
    }
  });

  it("leaves plain dates alone and an open end open", () => {
    expect(iso(calendarDateBounds({ from: new Date("2026-10-01T00:00:00.000Z") }))).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      to: undefined,
    });
    expect(calendarDateBounds({})).toEqual({});
  });
});
