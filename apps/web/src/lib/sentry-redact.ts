import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Strips anything privacy-sensitive from a browser-side Sentry event
 * before it's sent — mirrors apps/api/src/lib/sentry.ts's
 * redactSentryEvent (same reasoning: this handles health data, don't
 * trust Sentry's default scrubbing alone). Extracted as its own
 * function, not an inline beforeSend closure, so it's directly
 * unit-testable without needing to mock the SDK.
 *
 * Browser events carry different sensitive surfaces than the API's
 * server-side request events:
 * - `request.cookies`/`request.headers` — same reasoning as the API:
 *   never send session cookies or auth headers to Sentry.
 * - `request.url` — stripped to its path only. The web app's own
 *   client-side routes never carry health data in the URL itself, but
 *   an OAuth-style query string (e.g. a password-reset or
 *   email-verification token) can appear here exactly like
 *   GET /auth/sso/callback does server-side.
 * - breadcrumbs — Sentry's browser SDK auto-records DOM click/input
 *   breadcrumbs and can capture surrounding text content or form
 *   values. Every breadcrumb's `data` and `message` fields are
 *   stripped entirely (category/type/timestamp kept, since those are
 *   what's actually useful for reconstructing a repro sequence)
 *   rather than trying to allowlist which breadcrumb shapes are safe.
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
