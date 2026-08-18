import * as Sentry from "@sentry/node";
import { env } from "./env.js";
import type { Logger } from "@embr/shared";

/**
 * Same no-op-unless-configured pattern as apps/api/src/lib/sentry.ts —
 * background job failures are exactly the kind of thing that otherwise
 * only shows up as a line in logs nobody is tailing.
 */
export function initSentry(logger: Logger): void {
  if (!env.SENTRY_DSN) {
    logger.info("SENTRY_DSN not set — Sentry error monitoring disabled");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
    // No HTTP request context exists for a background job the way it
    // does for apps/api (this process never handles a request), but
    // this mirrors apps/api/src/lib/sentry.ts's beforeSend anyway —
    // cheap, consistent, and a real backstop the moment any future job
    // handler ends up wrapping something HTTP-shaped (a webhook
    // consumer, an outbound API-call retry job, ...).
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.url) {
          event.request.url = event.request.url.split("?")[0];
        }
      }
      return event;
    },
  });
  logger.info({ environment: env.NODE_ENV }, "Sentry error monitoring enabled");
}

/**
 * Reports an error to Sentry if enabled.
 *
 * IMPORTANT: `context` becomes Sentry's `event.extra` — this is NOT
 * touched by beforeSend above (which only scrubs `event.request`).
 * Never pass raw job payloads, symptom/cycle data, or anything
 * containing PII as `context` — pass identifiers (jobId, jobName) the
 * way index.ts's own call site already does, never the data itself.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
