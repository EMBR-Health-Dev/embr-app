"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Next.js's App Router special file for catching errors that escape
 * the root layout itself — a normal error.tsx boundary can't catch
 * these since the root layout is above where error.tsx applies. Must
 * render its own <html>/<body>, since it fully replaces the root
 * layout when it fires. Sentry.captureException is a no-op when the
 * SDK was never initialized (no DSN configured), same as every other
 * call site in this app.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>Please try refreshing the page.</p>
        </div>
      </body>
    </html>
  );
}
