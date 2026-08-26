import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/react-native";
import { redactSentryEvent } from "./sentry-redact";

const NO_HINT: unknown = {};

describe("redactSentryEvent", () => {
  it("strips cookies entirely", () => {
    const event = { request: { cookies: { a: "b" } } } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.cookies).toBeUndefined();
  });

  it("strips request headers entirely — the Authorization bearer token lives here", () => {
    const event = {
      request: { headers: { Authorization: "Bearer secret-access-token" } },
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

  it("strips the query portion of the URL — a password-reset token can land here", () => {
    const event = {
      request: { url: "https://api.embr.health/auth/reset-password?token=real-token-value" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.url).toBe("https://api.embr.health/auth/reset-password");
    expect(result.request?.url).not.toContain("token=");
    expect(result.request?.url).not.toContain("real-token-value");
  });

  it("leaves a URL with no query string unchanged", () => {
    const event = {
      request: { url: "https://api.embr.health/health/live" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.request?.url).toBe("https://api.embr.health/health/live");
  });

  it("strips breadcrumb data and message, keeping category/type/timestamp", () => {
    const event = {
      breadcrumbs: [
        {
          category: "http",
          type: "http",
          timestamp: 123,
          message: "POST /symptom-logs",
          data: { url: "https://api.embr.health/symptom-logs", status_code: 201 },
        },
      ],
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.breadcrumbs?.[0]?.data).toBeUndefined();
    expect(result.breadcrumbs?.[0]?.message).toBeUndefined();
    expect(result.breadcrumbs?.[0]?.category).toBe("http");
    expect(result.breadcrumbs?.[0]?.type).toBe("http");
    expect(result.breadcrumbs?.[0]?.timestamp).toBe(123);
  });

  it("is a no-op when there's no request context or breadcrumbs at all", () => {
    const event = { message: "some non-request error" } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result).toEqual(event);
  });

  it("does not touch other event fields (message, exception, tags)", () => {
    const event = {
      message: "Couldn't sync symptom logs",
      tags: { statusCode: "500" },
      request: { cookies: { a: "b" }, url: "https://x/y?z=1" },
    } as unknown as ErrorEvent;
    const result = redactSentryEvent(event, NO_HINT);
    expect(result.message).toBe("Couldn't sync symptom logs");
    expect(result.tags).toEqual({ statusCode: "500" });
  });
});
