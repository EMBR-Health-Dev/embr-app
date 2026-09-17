"use client";

import { useEffect } from "react";
import { Button } from "../components/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No client-side error reporting is configured for apps/admin yet
    // (see docs/DEPLOYMENT.md's "Known gap" note) — logging here at
    // least puts the error and its digest somewhere visible during a
    // bug report, without adding a new dependency to actually ship it.
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-2xl text-bone">Something went wrong</h1>
      <p className="max-w-sm text-bone/60">
        This page hit an unexpected error. Nothing was saved or lost because of this.
      </p>
      <div className="mt-2 flex gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="ghost" onClick={() => (window.location.href = "/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    </main>
  );
}
