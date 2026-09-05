"use client";

import type { InputHTMLAttributes } from "react";

/**
 * Previously duplicated verbatim in apps/web and apps/admin — see
 * button.tsx's doc comment for the same undefined-navy/bone/brass
 * issue this had too.
 *
 * The error state additionally used `border-red-400`/`text-red-600`,
 * a plain Tailwind red rather than either the `destructive` semantic
 * token or a theme-aware value — meaning it rendered identically in
 * both web's light theme and admin's dark theme instead of adapting,
 * and used a color outside the documented EMBR palette entirely.
 *
 * docs/design-tokens.md's own verified-contrast findings say
 * `destructive` (rose-500) fails WCAG as inline text or a thin border
 * on a light surface (2.60:1, under the 3:1 minimum) — so the error
 * message keeps the safe, verified `foreground` text color and pairs
 * it with a small `destructive`-colored dot, exactly the "accent
 * element" pattern the token doc recommends in place of destructive-
 * colored text.
 */
export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className={`rounded-sm border bg-surface px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
          error ? "border-destructive" : "border-border"
        }`}
        {...props}
      />
      {error && (
        <span className="flex items-center gap-1.5 text-xs text-foreground">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </span>
      )}
    </label>
  );
}
