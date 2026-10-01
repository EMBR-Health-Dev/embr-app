import { describe, expect, it } from "vitest";
import type { UserDto } from "@embr/types";
import { consentHref, isConsentExempt, needsConsentReview, pendingConsentTypes } from "./consent";

const current = { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "CURRENT" } as const;

describe("pendingConsentTypes", () => {
  it("lists every item that isn't CURRENT, in display order", () => {
    expect(
      pendingConsentTypes({
        consents: { TERMS: "OUTDATED", PRIVACY: "CURRENT", HEALTH_PROCESSING: "WITHDRAWN" },
      }),
    ).toEqual(["TERMS", "HEALTH_PROCESSING"]);
  });

  it("is empty when everything is current", () => {
    expect(pendingConsentTypes({ consents: current })).toEqual([]);
  });

  it("treats a response with no consent information (older API) as nothing pending", () => {
    expect(pendingConsentTypes({} as Pick<UserDto, "consents">)).toEqual([]);
  });
});

describe("needsConsentReview", () => {
  it("is false with no user", () => {
    expect(needsConsentReview(null)).toBe(false);
  });

  it("is true for an account with nothing recorded", () => {
    expect(
      needsConsentReview({
        consents: { TERMS: "MISSING", PRIVACY: "MISSING", HEALTH_PROCESSING: "MISSING" },
      }),
    ).toBe(true);
  });
});

describe("isConsentExempt", () => {
  it("keeps the consent screen, settings, export and auth pages reachable", () => {
    for (const path of ["/consent", "/settings", "/export", "/login", "/register"]) {
      expect(isConsentExempt(path)).toBe(true);
    }
  });

  it("gates the health features", () => {
    for (const path of ["/dashboard", "/brief", "/timeline", "/trends", "/onboarding"]) {
      expect(isConsentExempt(path)).toBe(false);
    }
  });
});

describe("consentHref", () => {
  it("carries the destination, encoded", () => {
    expect(consentHref("/brief?from=1")).toBe("/consent?redirect=%2Fbrief%3Ffrom%3D1");
  });
});
