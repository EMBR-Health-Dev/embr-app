import type { ErrorEvent } from "@sentry/react-native";

/**
 * Strips anything privacy-sensitive from a Sentry event before it's
 * sent — same reasoning as apps/api/src/lib/sentry.ts and
 * apps/web/src/lib/sentry-redact.ts's redactSentryEvent: this app
 * handles health data, don't trust Sentry's default scrubbing alone.
 *
 * Deliberately in its own file, importing only the *type* of
 * @sentry/react-native (erased entirely at compile time) rather than
 * the package itself: the real package transitively pulls in
 * react-native's own source, which uses Flow syntax vitest's
 * transform can't parse. Keeping this file free of any runtime
 * Sentry import is what makes it directly unit-testable at all — see
 * lib/sentry.ts for the actual SDK init, which does need the real
 * import.
 *
 * Unlike the web app (cookie-based sessions), mobile authenticates
 * with a Bearer token in the Authorization header (see
 * lib/api-client.ts) — there's no cookie jar to redact, but any HTTP
 * breadcrumb Sentry auto-records for a fetch/XHR call to the API can
 * carry that header, plus the request body and query string, exactly
 * like the web/API cases.
 */
export function redactSentryEvent(event: ErrorEvent, _hint: unknown): ErrorEvent {
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
