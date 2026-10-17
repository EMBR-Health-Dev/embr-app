import { describe, expect, it } from "vitest";
import { isWeeklyEmailWindow } from "../src/modules/notifications/weekly-email.js";

describe("isWeeklyEmailWindow", () => {
  it("opens on Sunday from 09:00 UTC", () => {
    expect(isWeeklyEmailWindow(new Date("2026-10-18T08:59:00Z"))).toBe(false);
    expect(isWeeklyEmailWindow(new Date("2026-10-18T09:00:00Z"))).toBe(true);
    expect(isWeeklyEmailWindow(new Date("2026-10-18T23:45:00Z"))).toBe(true);
  });

  it("is closed on every other day", () => {
    expect(isWeeklyEmailWindow(new Date("2026-10-17T12:00:00Z"))).toBe(false);
    expect(isWeeklyEmailWindow(new Date("2026-10-19T09:00:00Z"))).toBe(false);
  });
});
