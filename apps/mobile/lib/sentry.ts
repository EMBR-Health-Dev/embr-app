import * as Sentry from "@sentry/react-native";
import { redactSentryEvent } from "./sentry-redact";

/**
 * Deliberately a no-op when EXPO_PUBLIC_SENTRY_DSN is unset — local
 * dev never needs a real DSN configured, matching
 * apps/api/src/lib/sentry.ts's precedent. Must be EXPO_PUBLIC_-
 * prefixed (see .env.example) since that's the only prefix Expo
 * inlines into the built app at all. Session Replay / mobile Session
 * Replay is deliberately not enabled — same reasoning as the web
 * apps: a much larger privacy surface than error events alone, not a
 * drive-by default for a health app.
 */
export function initSentry(): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend: redactSentryEvent,
  });
}

/**
 * Reports an error to Sentry if enabled. Safe to call
 * unconditionally — becomes a no-op when no DSN is configured, same
 * as apps/api/src/lib/sentry.ts's captureException.
 *
 * IMPORTANT: `context` becomes Sentry's `event.extra` — this is NOT
 * touched by redactSentryEvent (which only scrubs `event.request`/
 * `event.breadcrumbs`). Never pass raw symptom/cycle/onboarding/brief
 * data as `context` — identifiers and metadata only.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
