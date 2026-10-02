import { beforeEach, describe, expect, it } from "vitest";
import { LEGAL_DOCUMENT_VERSIONS, STILL_ACCEPTED_VERSIONS } from "@embr/validation";
import { consentRepository } from "../src/modules/consent/consent.repository.js";
import { consentService } from "../src/modules/consent/consent.service.js";
import { resetFakeConsentStore } from "./helpers/fake-consent-repository.js";

// consentRepository is the in-memory fake registered by test/setup.ts.
const grant = (userId: string, type: "TERMS" | "PRIVACY" | "HEALTH_PROCESSING", version: string) =>
  consentRepository.insertMany([
    { userId, type, version, locale: "en", action: "GRANTED", source: "REGISTRATION" },
  ]);

beforeEach(() => resetFakeConsentStore());

describe("consent versions", () => {
  it("keeps an acceptance of a still accepted earlier version current (no forced re-review)", async () => {
    expect(LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING).toBe("0.2-draft");
    expect(STILL_ACCEPTED_VERSIONS.HEALTH_PROCESSING).toContain("0.1-draft");
    await grant("u1", "TERMS", LEGAL_DOCUMENT_VERSIONS.TERMS);
    await grant("u1", "PRIVACY", LEGAL_DOCUMENT_VERSIONS.PRIVACY);
    await grant("u1", "HEALTH_PROCESSING", "0.1-draft");

    expect((await consentService.statesFor("u1")).HEALTH_PROCESSING).toBe("CURRENT");
    expect(await consentService.usersWithCurrentHealthProcessing(["u1"])).toEqual(new Set(["u1"]));
  });

  it("still treats any other earlier version as outdated", async () => {
    await grant("u2", "HEALTH_PROCESSING", "0.0-draft");
    expect((await consentService.statesFor("u2")).HEALTH_PROCESSING).toBe("OUTDATED");
  });

  it("records new acceptances only at the exact current version", async () => {
    await expect(
      consentService.grant(
        "u3",
        [{ type: "HEALTH_PROCESSING", version: "0.1-draft" }],
        "en",
        "SETTINGS",
      ),
    ).rejects.toMatchObject({ code: "CONSENT_VERSION_OUTDATED" });
  });
});
