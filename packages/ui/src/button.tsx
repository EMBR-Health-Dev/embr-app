"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

/**
 * Previously duplicated verbatim in apps/web and apps/admin, each
 * using `bg-navy`/`text-bone`/`bg-brass` — none of which are defined
 * in either app's tailwind.config.ts or globals.css (see
 * docs/design-tokens.md). Those classes predate the graphite/lilac
 * semantic token system introduced in "Design tokens: canonical EMBR
 * palette + semantic token architecture" and were never migrated,
 * meaning both copies of this component rendered with no Tailwind-
 * generated color styling at all. Rewritten against the real, WCAG-
 * verified semantic tokens (`primary`, `foreground`, `ring`, ...),
 * which are identical token *names* in both apps — only the
 * underlying CSS variable values differ per theme — so one
 * implementation now correctly themes itself in both apps.
 */
export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center rounded px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<Variant, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
    ghost: "bg-transparent text-foreground hover:bg-muted",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
