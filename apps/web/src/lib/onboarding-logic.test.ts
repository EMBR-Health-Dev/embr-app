import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { isOnboardingStep, STEP_ROUTES, ONBOARDING_STEPS } from "./onboarding-steps";
import { firstSuggestedCategory, ONBOARDING_AREA_TO_CATEGORIES } from "./onboarding-areas";
import { startingPointMessageKey } from "./onboarding-starting-point";
import en from "../../messages/en.json";

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

describe("startingPointMessageKey", () => {
  const t = createTranslator({ locale: "en", messages: en, namespace: "Dashboard" });
  // startingPointMessageKey returns a plain `string | null`, not a
  // literal union next-intl's strict key typing can verify statically
  // — the values are correct (this test's whole job is proving that),
  // this cast just tells the type system what the runtime already
  // confirms.
  const tKey = t as (key: string) => string;

  it("returns the correct key for every jobToBeDone value, resolving to the approved copy", () => {
    expect(tKey(startingPointMessageKey("UNDERSTAND_EXPERIENCE")!)).toBe(
      "Let's start building your record.",
    );
    expect(tKey(startingPointMessageKey("UNDERSTAND_PATTERNS")!)).toBe(
      "You're here to understand patterns. We'll start surfacing them as you log.",
    );
    expect(tKey(startingPointMessageKey("PREPARE_FOR_APPOINTMENT")!)).toBe(
      "You're preparing for a healthcare conversation. Let's help you build something concrete.",
    );
    expect(tKey(startingPointMessageKey("KEEP_RECORD")!)).toBe(
      "Let's start building your record over time.",
    );
    expect(tKey(startingPointMessageKey("NOT_SURE")!)).toBe(
      "Let's see what your record starts to show.",
    );
  });

  it("returns null for no answer or an unrecognized value", () => {
    expect(startingPointMessageKey(null)).toBeNull();
    expect(startingPointMessageKey("SOMETHING_UNEXPECTED")).toBeNull();
  });
});
