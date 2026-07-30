import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

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
    // Never send request bodies/cookies to Sentry — this handles health
    // data. beforeSend strips anything that slipped past our own
    // sanitization rather than trusting Sentry's default scrubbing alone.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
  });

  logger.info({ environment: env.NODE_ENV }, "Sentry error monitoring enabled");
}

/**
 * Reports an error to Sentry if enabled. Safe to call unconditionally —
 * becomes a no-op when SENTRY_DSN is unset since Sentry.captureException
 * silently drops events when the SDK was never initialized.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
