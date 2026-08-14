import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Strips anything that slipped past our own request-level sanitization
 * rather than trusting Sentry's default scrubbing alone — this handles
 * health data. Extracted as its own function (rather than an inline
 * closure inside Sentry.init()) specifically so it's directly
 * unit-testable without needing to mock the whole SDK.
 *
 * Query strings get the same treatment as cookies/body: Sentry's own
 * HTTP integration auto-captures event.request.url (and, separately,
 * query_string) for any exception during request handling — this
 * happens independently of whatever this app manually passes as
 * captureException's `context` argument. Several routes carry
 * genuinely sensitive values in query params by nature of how their
 * protocol works — GET /auth/sso/callback receives an OAuth
 * authorization code exactly this way.
 */
export function redactSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) {
      event.request.url = event.request.url.split("?")[0];
    }
  }
  return event;
}

/**
 * Initializes Sentry for the API process.
 *
 * Deliberately a no-op when SENTRY_DSN is unset — local dev and CI never
 * need a real DSN configured, and every call site below is safe to run
 * whether or not `init()` actually did anything. Must be called before
 * `createApp()` so unhandled errors during route registration are still
 * captured, but the http request-tracing handlers are wired inside
 * `app.ts` itself around the existing middleware stack.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.info("SENTRY_DSN not set — Sentry error monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    beforeSend: redactSentryEvent,
  });

  logger.info({ environment: env.NODE_ENV }, "Sentry error monitoring enabled");
}

/**
 * Reports an error to Sentry if enabled. Safe to call unconditionally —
 * becomes a no-op when SENTRY_DSN is unset since Sentry.captureException
 * silently drops events when the SDK was never initialized.
 *
 * IMPORTANT: `context` becomes Sentry's `event.extra` — this is NOT
 * touched by redactSentryEvent above (which only scrubs
 * `event.request`). Never pass raw request bodies, symptom/cycle/
 * onboarding/brief data, or anything containing PII as `context` —
 * pass identifiers and metadata the way error-handler.ts's own call
 * site already does (requestId, path, method, code, statusCode),
 * never the data itself.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
