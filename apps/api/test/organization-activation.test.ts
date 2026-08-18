import { describe, expect, it } from "vitest";
import {
  computeActivatedUserIds,
  computeWeeklyActiveUserIds,
  toPercentage,
  ACTIVATION_WINDOW_DAYS,
  WEEKLY_ACTIVE_WINDOW_DAYS,
} from "../src/modules/organizations/organization.activation.js";

describe("computeActivatedUserIds", () => {
  it("activates a member who logged within their 30-day window", () => {
    const memberships = [{ userId: "u1", createdAt: new Date("2026-01-01") }];
    const activity = [{ userId: "u1", occurredAt: new Date("2026-01-15") }];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("u1")).toBe(true);
  });

  it("does not activate a member whose only activity is after their 30-day window", () => {
    const memberships = [{ userId: "u1", createdAt: new Date("2026-01-01") }];
    const activity = [{ userId: "u1", occurredAt: new Date("2026-02-05") }];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("u1")).toBe(false);
  });

  it("activates exactly at the 30-day boundary (inclusive)", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const boundary = new Date(createdAt);
    boundary.setDate(boundary.getDate() + ACTIVATION_WINDOW_DAYS);

    const memberships = [{ userId: "u1", createdAt }];
    const activity = [{ userId: "u1", occurredAt: boundary }];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("u1")).toBe(true);
  });

  it("does not activate a member with zero activity at all", () => {
    const memberships = [{ userId: "u1", createdAt: new Date("2026-01-01") }];

    const result = computeActivatedUserIds(memberships, []);
    expect(result.has("u1")).toBe(false);
  });

  it("does not activate a member whose only activity is before they joined", () => {
    const memberships = [{ userId: "u1", createdAt: new Date("2026-01-15") }];
    const activity = [{ userId: "u1", occurredAt: new Date("2026-01-10") }];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("u1")).toBe(false);
  });

  it("evaluates each member against their own join date independently", () => {
    const memberships = [
      { userId: "early-joiner", createdAt: new Date("2026-01-01") },
      { userId: "late-joiner", createdAt: new Date("2026-03-01") },
    ];
    const activity = [{ userId: "late-joiner", occurredAt: new Date("2026-01-15") }];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("early-joiner")).toBe(false);
    expect(result.has("late-joiner")).toBe(false);
  });

  it("handles multiple members correctly in one pass", () => {
    const memberships = [
      { userId: "u1", createdAt: new Date("2026-01-01") },
      { userId: "u2", createdAt: new Date("2026-01-01") },
      { userId: "u3", createdAt: new Date("2026-01-01") },
    ];
    const activity = [
      { userId: "u1", occurredAt: new Date("2026-01-10") },
      { userId: "u3", occurredAt: new Date("2026-01-20") },
    ];

    const result = computeActivatedUserIds(memberships, activity);
    expect(result.has("u1")).toBe(true);
    expect(result.has("u2")).toBe(false);
    expect(result.has("u3")).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe("computeWeeklyActiveUserIds", () => {
  const asOf = new Date("2026-02-01T00:00:00.000Z");

  it("counts a member active within the trailing 7 days", () => {
    const activity = [{ userId: "u1", occurredAt: new Date("2026-01-28") }];
    const result = computeWeeklyActiveUserIds(["u1"], activity, asOf);
    expect(result.has("u1")).toBe(true);
  });

  it("does not count activity older than 7 days", () => {
    const activity = [{ userId: "u1", occurredAt: new Date("2026-01-20") }];
    const result = computeWeeklyActiveUserIds(["u1"], activity, asOf);
    expect(result.has("u1")).toBe(false);
  });

  it("counts activity exactly at the 7-day boundary (inclusive)", () => {
    const boundary = new Date(asOf);
    boundary.setDate(boundary.getDate() - WEEKLY_ACTIVE_WINDOW_DAYS);
    const activity = [{ userId: "u1", occurredAt: boundary }];

    const result = computeWeeklyActiveUserIds(["u1"], activity, asOf);
    expect(result.has("u1")).toBe(true);
  });

  it("uses one shared window for every member, not a per-member relative one", () => {
    const activity = [
      { userId: "u1", occurredAt: new Date("2026-01-30") },
      { userId: "u2", occurredAt: new Date("2026-01-29") },
    ];
    const result = computeWeeklyActiveUserIds(["u1", "u2"], activity, asOf);
    expect(result.has("u1")).toBe(true);
    expect(result.has("u2")).toBe(true);
  });

  it("excludes activity from a user not in the eligible list", () => {
    const activity = [{ userId: "not-eligible", occurredAt: new Date("2026-01-30") }];
    const result = computeWeeklyActiveUserIds(["u1"], activity, asOf);
    expect(result.has("not-eligible")).toBe(false);
    expect(result.size).toBe(0);
  });

  it("does not count activity after asOf", () => {
    const activity = [{ userId: "u1", occurredAt: new Date("2026-02-05") }];
    const result = computeWeeklyActiveUserIds(["u1"], activity, asOf);
    expect(result.has("u1")).toBe(false);
  });
});

describe("toPercentage", () => {
  it("computes a whole-number rounded percentage", () => {
    expect(toPercentage(1, 3)).toBe(33);
    expect(toPercentage(2, 3)).toBe(67);
  });

  it("returns 0 when the denominator is 0, rather than NaN or Infinity", () => {
    expect(toPercentage(0, 0)).toBe(0);
  });

  it("returns 100 when count equals the denominator", () => {
    expect(toPercentage(5, 5)).toBe(100);
  });

  it("returns 0 when count is 0 and denominator is nonzero", () => {
    expect(toPercentage(0, 10)).toBe(0);
  });
});
