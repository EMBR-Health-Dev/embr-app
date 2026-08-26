import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Strips anything privacy-sensitive from a browser-side Sentry event
 * before it's sent — mirrors apps/web/src/lib/sentry-redact.ts and
 * apps/api/src/lib/sentry.ts's redactSentryEvent (same reasoning:
 * this handles health-adjacent operational data, don't trust
 * Sentry's default scrubbing alone). Extracted as its own function,
 * not an inline beforeSend closure, so it's directly unit-testable
 * without needing to mock the SDK.
 *
 * The admin console is internal-only, but it still authenticates via
 * the same cookie-based session as apps/web and its pages render
 * account metadata and audit-log entries — cookies, headers, request
 * bodies, and query strings all get the same treatment as apps/web's
 * redaction, for the same reasons.
 */
export function redactSentryEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) {
      try {
        const url = new URL(event.request.url);
        event.request.url = url.origin + url.pathname;
      } catch {
        event.request.url = event.request.url.split("?")[0];
      }
    }
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const stripped = { ...crumb };
      delete stripped.data;
      delete stripped.message;
      return stripped;
    });
  }

  return event;
}
