import * as Sentry from "@sentry/nextjs";

/**
 * Next.js's own instrumentation hook — runs once per runtime (Node.js
 * and edge each get their own invocation) before any other app code.
 * Delegates to the matching config file rather than duplicating the
 * init call here, so sentry.server.config.ts/sentry.edge.config.ts
 * stay the single source of truth for each runtime's setup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Next.js's App Router hook for capturing errors thrown during
 * server-side rendering (server components, route handlers) that
 * never reach a client-side error boundary. Safe to reference
 * unconditionally — Sentry.captureRequestError becomes a no-op the
 * same way captureException does when Sentry.init was never called
 * (no DSN configured).
 */
export const onRequestError = Sentry.captureRequestError;
