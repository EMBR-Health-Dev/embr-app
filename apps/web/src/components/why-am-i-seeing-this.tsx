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
 *
 * The chevron (group-open:rotate-90 on the `group` <details>) gives the
 * disclosure a visible open/closed state — an underline alone reads as
 * a hyperlink, not an expandable control.
 */
export function WhyAmISeeingThis({ children }: { children: React.ReactNode }) {
  const t = useTranslations("WhyAmISeeingThis");

  return (
    <details className="group mt-3">
      <summary className="flex cursor-pointer items-center gap-1.5 text-caption font-medium text-foreground/60 marker:content-none hover:text-foreground/80">
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className="h-2 w-2 shrink-0 fill-current transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M1 0l6 4-6 4V0z" />
        </svg>
        {t("toggle")}
      </summary>
      <div className="mt-2 pl-3.5 text-caption text-foreground/60">{children}</div>
    </details>
  );
}
