"use client";

import { useTranslations } from "next-intl";

/**
 * "No insight without evidence" as a UI primitive — every pattern or
 * insight gets an optional, collapsed-by-default disclosure showing
 * the literal data behind it, not just the summarized claim. Native
 * <details>, matching this codebase's existing disclosure pattern
 * (see app-nav.tsx's "More" menu) — keyboard- and screen-reader-
 * operable with no open/closed state to manage in React.
 *
 * A layout primitive only: it renders whatever evidence its caller
 * passes as children. It never decides what counts as evidence.
 */
export function WhyAmISeeingThis({ children }: { children: React.ReactNode }) {
  const t = useTranslations("WhyAmISeeingThis");

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-foreground/60 underline underline-offset-2 marker:content-none">
        {t("toggle")}
      </summary>
      <div className="mt-2 text-xs text-foreground/60">{children}</div>
    </details>
  );
}
