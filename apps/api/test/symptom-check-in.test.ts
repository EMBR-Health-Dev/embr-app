import { describe, expect, it } from "vitest";
import {
  checkInDateStatus,
  checkInOccurredAt,
  localNoon,
} from "../src/modules/symptoms/symptom-check-in.js";
import { localDate } from "../src/modules/trends/symptom-history.js";

describe("check in date rules", () => {
  it("assigns 11:30 pm Tokyo to that Tokyo date, though it is still the afternoon in UTC", () => {
    const at2330Tokyo = new Date("2026-10-01T14:30:00.000Z");
    expect(localDate(at2330Tokyo, "Asia/Tokyo")).toBe("2026-10-01");
    expect(checkInDateStatus("2026-10-01", "Asia/Tokyo", at2330Tokyo)).toBe("ok");
    expect(checkInDateStatus("2026-10-02", "Asia/Tokyo", at2330Tokyo)).toBe("future");
    expect(checkInOccurredAt("2026-10-01", "Asia/Tokyo", at2330Tokyo)).toBe(at2330Tokyo);
  });

  it("still accepts the previous day's check in after local midnight, inside that day", () => {
    const at0015Tokyo = new Date("2026-10-01T15:15:00.000Z"); // 2 Oct, 00:15 in Tokyo
    expect(checkInDateStatus("2026-10-01", "Asia/Tokyo", at0015Tokyo)).toBe("ok");
    const occurredAt = checkInOccurredAt("2026-10-01", "Asia/Tokyo", at0015Tokyo);
    // A symptom added in that late edit stays on 1 October.
    expect(localDate(occurredAt, "Asia/Tokyo")).toBe("2026-10-01");
    expect(occurredAt.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("rejects dates older than yesterday", () => {
    const now = new Date("2026-10-02T09:00:00.000Z");
    expect(checkInDateStatus("2026-09-30", "UTC", now)).toBe("too_old");
    expect(checkInDateStatus("2026-10-01", "UTC", now)).toBe("ok");
  });

  it("finds local noon across zones and a daylight saving change", () => {
    expect(localNoon("2026-10-01", "UTC").toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(localNoon("2026-07-01", "Europe/Paris").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(localNoon("2026-12-01", "Europe/Paris").toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(localNoon("2026-03-08", "America/New_York").toISOString()).toBe(
      "2026-03-08T16:00:00.000Z",
    );
  });
});
