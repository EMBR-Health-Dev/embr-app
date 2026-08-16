import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import { isOnboardingStep, STEP_ROUTES, ONBOARDING_STEPS } from "./onboarding-steps";
import { firstSuggestedCategory, ONBOARDING_AREA_TO_CATEGORIES } from "./onboarding-areas";
import { startingPointMessageKey } from "./onboarding-starting-point";
import en from "../locales/en.json";

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

  it("every step has a corresponding mobile route", () => {
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
  beforeAll(async () => {
    // eslint-disable-next-line import/no-named-as-default-member -- same known i18next default/named-export false positive already noted and suppressed in lib/i18n/plurals.test.ts
    await i18next.init({
      resources: { en: { translation: en } },
      lng: "en",
      fallbackLng: "en",
      compatibilityJSON: "v4",
      interpolation: { escapeValue: false },
    });
  });

  it("returns the correct key for every jobToBeDone value, resolving to the approved copy", () => {
    // eslint-disable-next-line import/no-named-as-default-member
    const t = i18next.t.bind(i18next);
    expect(t(startingPointMessageKey("UNDERSTAND_EXPERIENCE")!)).toBe(
      "Let's start building your record.",
    );
    expect(t(startingPointMessageKey("UNDERSTAND_PATTERNS")!)).toBe(
      "You're here to understand patterns. We'll start surfacing them as you log.",
    );
    expect(t(startingPointMessageKey("PREPARE_FOR_APPOINTMENT")!)).toBe(
      "You're preparing for a healthcare conversation. Let's help you build something concrete.",
    );
    expect(t(startingPointMessageKey("KEEP_RECORD")!)).toBe(
      "Let's start building your record over time.",
    );
    expect(t(startingPointMessageKey("NOT_SURE")!)).toBe(
      "Let's see what your record starts to show.",
    );
  });

  it("returns null for no answer or an unrecognized value", () => {
    expect(startingPointMessageKey(null)).toBeNull();
    expect(startingPointMessageKey("SOMETHING_UNEXPECTED")).toBeNull();
  });
});
