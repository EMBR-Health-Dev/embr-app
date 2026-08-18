import { describe, expect, it } from "vitest";
import { isSuppressedByCohortSize } from "../src/lib/cohort-suppression.js";

describe("isSuppressedByCohortSize", () => {
  it("suppresses when count is below the threshold", () => {
    expect(isSuppressedByCohortSize(4, 5)).toBe(true);
  });

  it("does not suppress when count is exactly at the threshold (strict <, not <=)", () => {
    expect(isSuppressedByCohortSize(5, 5)).toBe(false);
  });

  it("does not suppress when count is above the threshold", () => {
    expect(isSuppressedByCohortSize(6, 5)).toBe(false);
  });

  it("suppresses a count of zero against any positive threshold", () => {
    expect(isSuppressedByCohortSize(0, 5)).toBe(true);
  });
});
