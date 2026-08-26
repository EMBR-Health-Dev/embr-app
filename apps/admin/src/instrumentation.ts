import * as Sentry from "@sentry/nextjs";

/**
 * Next.js's own instrumentation hook — see apps/web/src/instrumentation.ts
 * for the full reasoning, identical here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
