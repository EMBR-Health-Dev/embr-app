import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./src/lib/sentry-redact";

/**
 * Same no-op-unless-configured pattern as sentry.client.config.ts and
 * apps/api/src/lib/sentry.ts. This covers server components, route
 * handlers, and SSR — anything running in the Next.js Node.js runtime,
 * as opposed to the edge runtime (see sentry.edge.config.ts) or the
 * browser (see sentry.client.config.ts).
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: redactSentryEvent,
  });
}
