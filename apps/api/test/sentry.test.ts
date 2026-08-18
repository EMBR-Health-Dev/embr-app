import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: { SENTRY_DSN: undefined, NODE_ENV: "test", SENTRY_TRACES_SAMPLE_RATE: 0 },
}));

const { redactSentryEvent } = await import("../src/lib/sentry.js");

describe("redactSentryEvent", () => {
  it("strips cookies entirely", () => {
    const event = {
      request: { cookies: { embr_access: "secret-jwt", embr_refresh: "secret-refresh" } },
    };
    const result = redactSentryEvent(event as never);
    expect(result.request?.cookies).toBeUndefined();
  });

  it("strips the request body entirely — health data can appear in POST bodies", () => {
    const event = {
      request: { data: { category: "HOT_FLASH", severity: "SEVERE", notes: "very bad today" } },
    };
    const result = redactSentryEvent(event as never);
    expect(result.request?.data).toBeUndefined();
  });

  it("strips query_string entirely", () => {
    const event = { request: { query_string: "token=abc123&email=person@example.com" } };
    const result = redactSentryEvent(event as never);
    expect(result.request?.query_string).toBeUndefined();
  });

  it("strips the query portion of the URL — the real gap this milestone fixes: Sentry auto-captures event.request.url independently of anything manually passed as context, and GET /auth/sso/callback carries a real OAuth code in exactly this field", () => {
    const event = {
      request: {
        url: "https://api.embr.health/auth/sso/callback?code=real-oauth-authorization-code&state=abc",
      },
    };
    const result = redactSentryEvent(event as never);
    expect(result.request?.url).toBe("https://api.embr.health/auth/sso/callback");
    expect(result.request?.url).not.toContain("code=");
    expect(result.request?.url).not.toContain("real-oauth-authorization-code");
  });

  it("leaves a URL with no query string unchanged", () => {
    const event = { request: { url: "https://api.embr.health/health/live" } };
    const result = redactSentryEvent(event as never);
    expect(result.request?.url).toBe("https://api.embr.health/health/live");
  });

  it("is a no-op when there's no request context at all", () => {
    const event = { message: "some non-request error" };
    const result = redactSentryEvent(event as never);
    expect(result).toEqual(event);
  });

  it("does not touch other event fields (message, exception, tags)", () => {
    const event = {
      message: "Couldn't generate the brief right now",
      tags: { statusCode: "500" },
      request: { cookies: { a: "b" }, url: "https://x/y?z=1" },
    };
    const result = redactSentryEvent(event as never);
    expect(result.message).toBe("Couldn't generate the brief right now");
    expect(result.tags).toEqual({ statusCode: "500" });
  });
});
