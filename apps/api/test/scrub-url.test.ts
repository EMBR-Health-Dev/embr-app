import { describe, expect, it } from "vitest";
import { scrubSensitiveQueryParams } from "../src/lib/scrub-url.js";

describe("scrubSensitiveQueryParams", () => {
  it("redacts an OAuth code and state on the SSO callback path", () => {
    const result = scrubSensitiveQueryParams(
      "/auth/sso/callback?code=abc123secret&state=xyz789secret",
    );
    expect(result).toBe("/auth/sso/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D");
    expect(result).not.toContain("abc123secret");
    expect(result).not.toContain("xyz789secret");
  });

  it("is case-insensitive when matching sensitive param names", () => {
    const result = scrubSensitiveQueryParams("/auth/sso/callback?Code=abc123&STATE=xyz789");
    expect(result).not.toContain("abc123");
    expect(result).not.toContain("xyz789");
  });

  it("redacts access_token, refresh_token, id_token, token, and client_secret", () => {
    const result = scrubSensitiveQueryParams(
      "/some/route?access_token=a&refresh_token=b&id_token=c&token=d&client_secret=e",
    );
    expect(result).not.toMatch(/=a(&|$)/);
    expect(result).not.toMatch(/=b(&|$)/);
    expect(result).not.toMatch(/=c(&|$)/);
    expect(result).not.toMatch(/=d(&|$)/);
    expect(result).not.toMatch(/=e(&|$)/);
  });

  it("leaves ordinary query params untouched", () => {
    const result = scrubSensitiveQueryParams("/treatments?category=HRT&pageSize=20&page=2");
    expect(result).toBe("/treatments?category=HRT&pageSize=20&page=2");
  });

  it("only redacts the sensitive param's value, keeping other params intact", () => {
    const result = scrubSensitiveQueryParams(
      "/auth/sso/callback?state=secretvalue&returnTo=%2Fdashboard",
    );
    expect(result).toContain("returnTo=%2Fdashboard");
    expect(result).not.toContain("secretvalue");
  });

  it("returns the original string unchanged when there is no query string", () => {
    const result = scrubSensitiveQueryParams("/health/live");
    expect(result).toBe("/health/live");
  });

  it("returns the original string unchanged when no query param is sensitive", () => {
    const result = scrubSensitiveQueryParams("/symptoms?category=HOT_FLASH");
    expect(result).toBe("/symptoms?category=HOT_FLASH");
  });

  it("preserves the path exactly, including nested segments", () => {
    const result = scrubSensitiveQueryParams("/organizations/mine/trends?windowDays=90");
    expect(result).toBe("/organizations/mine/trends?windowDays=90");
  });
});
