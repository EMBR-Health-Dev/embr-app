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

  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
  logger.info({ environment: env.NODE_ENV }, "Sentry error monitoring enabled");
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
