import { describe, expect, it } from "vitest";
import { isOnboardingStep, STEP_ROUTES, ONBOARDING_STEPS } from "./onboarding-steps";
import { firstSuggestedCategory, ONBOARDING_AREA_TO_CATEGORIES } from "./onboarding-areas";
import { startingPointMessage } from "./onboarding-starting-point";

describe("isOnboardingStep", () => {
  it("accepts every real step", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(isOnboardingStep(step)).toBe(true);
    }
  });

  it("rejects null and unknown strings", () => {
    expect(isOnboardingStep(null)).toBe(false);
    expect(isOnboardingStep("NOT_A_REAL_STEP")).toBe(false);
    expect(isOnboardingStep("")).toBe(false);
  });

  it("every step has a corresponding route", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(STEP_ROUTES[step]).toMatch(/^\/onboarding\//);
    }
  });
});

describe("firstSuggestedCategory", () => {
  it("returns undefined when nothing was selected", () => {
    expect(firstSuggestedCategory([])).toBeUndefined();
  });

  it("returns the first category mapped from the first selected area", () => {
    expect(firstSuggestedCategory(["SLEEP", "MOOD"])).toBe(ONBOARDING_AREA_TO_CATEGORIES.SLEEP[0]);
  });

  it("never returns a raw onboarding bucket key as if it were a real category", () => {
    const REAL_CATEGORIES = new Set(Object.values(ONBOARDING_AREA_TO_CATEGORIES).flat());
    for (const area of Object.keys(ONBOARDING_AREA_TO_CATEGORIES)) {
      const suggested = firstSuggestedCategory([area]);
      expect(REAL_CATEGORIES.has(suggested!)).toBe(true);
      expect(suggested).not.toBe(area);
    }
  });
});

describe("startingPointMessage", () => {
  it("returns the exact approved copy for each jobToBeDone value", () => {
    expect(startingPointMessage("UNDERSTAND_EXPERIENCE")).toBe("Let's start building your record.");
    expect(startingPointMessage("UNDERSTAND_PATTERNS")).toBe(
      "You're here to understand patterns. We'll start surfacing them as you log.",
    );
    expect(startingPointMessage("PREPARE_FOR_APPOINTMENT")).toBe(
      "You're preparing for a healthcare conversation. Let's help you build something concrete.",
    );
    expect(startingPointMessage("KEEP_RECORD")).toBe("Let's start building your record over time.");
    expect(startingPointMessage("NOT_SURE")).toBe("Let's see what your record starts to show.");
  });

  it("returns null for no answer or an unrecognized value", () => {
    expect(startingPointMessage(null)).toBeNull();
    expect(startingPointMessage("SOMETHING_UNEXPECTED")).toBeNull();
  });
});
