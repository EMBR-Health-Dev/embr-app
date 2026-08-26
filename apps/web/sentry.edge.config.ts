import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./src/lib/sentry-redact";

/**
 * Same no-op-unless-configured pattern as sentry.client.config.ts and
 * sentry.server.config.ts. This app has no middleware.ts or edge route
 * handlers today, but Next.js still loads this config for the edge
 * runtime whenever one exists, so it's here for when one does.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: redactSentryEvent,
  });
}
