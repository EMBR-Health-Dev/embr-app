import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./lib/sentry-redact";

/**
 * Client-side (browser) Sentry init — see
 * apps/web/src/instrumentation-client.ts for the full reasoning
 * behind this file's location and behavior, identical here. Same
 * no-op-unless-NEXT_PUBLIC_SENTRY_DSN-is-set pattern, same deliberate
 * exclusion of Session Replay.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: redactSentryEvent,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
