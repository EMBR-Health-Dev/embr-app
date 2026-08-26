import * as Sentry from "@sentry/nextjs";
import { redactSentryEvent } from "./lib/sentry-redact";

/**
 * Client-side (browser) Sentry init. Next.js's officially recommended
 * location as of Next 15.3+ — sentry.client.config.ts is deprecated
 * and stops working under Turbopack (confirmed via a real `next
 * build`'s own deprecation warning against the installed SDK
 * version). Deliberately a no-op when NEXT_PUBLIC_SENTRY_DSN is
 * unset, matching apps/api/src/lib/sentry.ts's precedent. Session
 * Replay is deliberately not enabled: this product handles health
 * data, and replay's DOM/screenshot capture is a much larger privacy
 * surface than error events alone — revisit only with its own
 * dedicated redaction review, not as a drive-by default.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: redactSentryEvent,
  });
}

// Required by the SDK to instrument client-side route transitions —
// without it, navigation spans just don't get recorded. A no-op the
// same way Sentry.init above is when no DSN is configured.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
