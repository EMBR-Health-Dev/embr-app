import { describe, expect, it } from "vitest";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import { redactSentryEvent } from "./sentry-redact";

const NO_HINT = {} as EventHint;

describe("redactSentryEvent", () => {
  it("strips cookies entirely", () => {
    const event = {
      request: { cookies: { embr_at: "secret-jwt", embr_csrf: "secret-csrf" } },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.cookies).toBeUndefined();
  });

  it("strips request headers entirely", () => {
    const event = {
      request: { headers: { Authorization: "Bearer secret", Cookie: "embr_at=secret" } },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.headers).toBeUndefined();
  });

  it("strips request data entirely — health data can appear in a POST body", () => {
    const event = {
      request: { data: { category: "HOT_FLASH", severity: "SEVERE", notes: "very bad today" } },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.data).toBeUndefined();
  });

  it("strips query_string entirely", () => {
    const event = {
      request: { query_string: "token=abc123&email=person@example.com" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.query_string).toBeUndefined();
  });

  it("strips the query portion of the URL — a password-reset or email-verification token can land here", () => {
    const event = {
      request: { url: "https://app.embr.health/reset-password?token=real-reset-token-value" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.url).toBe("https://app.embr.health/reset-password");
    expect(result.request?.url).not.toContain("token=");
    expect(result.request?.url).not.toContain("real-reset-token-value");
  });

  it("leaves a URL with no query string unchanged", () => {
    const event = {
      request: { url: "https://app.embr.health/dashboard" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.url).toBe("https://app.embr.health/dashboard");
  });

  it("strips breadcrumb data and message, keeping category/type/timestamp", () => {
    const event = {
      breadcrumbs: [
        {
          category: "ui.click",
          type: "user",
          timestamp: 123,
          message: "Logged HOT_FLASH severity SEVERE",
          data: { value: "very bad today" },
        },
      ],
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(result.breadcrumbs?.[0]?.message).toBeUndefined();
    expect(result.breadcrumbs?.[0]?.category).toBe("ui.click");
    expect(result.breadcrumbs?.[0]?.type).toBe("user");
    expect(result.breadcrumbs?.[0]?.timestamp).toBe(123);
  });

  it("is a no-op when there's no request context or breadcrumbs at all", () => {
    const event = { message: "some non-request error" } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result).toEqual(event);
  });

  it("does not touch other event fields (message, exception, tags)", () => {
    const event = {
      message: "Couldn't load the dashboard",
      tags: { statusCode: "500" },
      request: { cookies: { a: "b" }, url: "https://x/y?z=1" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.message).toBe("Couldn't load the dashboard");
    expect(result.tags).toEqual({ statusCode: "500" });
  });
});
