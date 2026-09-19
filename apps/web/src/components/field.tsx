"use client";

import { useId, type InputHTMLAttributes } from "react";

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const errorId = useId();
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-sm border bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
          error ? "border-foreground" : "border-border"
        }`}
        {...props}
      />
      {/* rose-500 (the destructive token) measures 2.60:1 on pearl-50 —
          under the 3:1 minimum for text or a border, see
          docs/design-tokens.md's contrast table — so the error text
          stays foreground (always safe) and destructive appears only as
          a small accent stripe, never as the text color itself. */}
      {error && (
        <span
          id={errorId}
          role="alert"
          className="border-l-2 border-destructive pl-2 text-xs font-medium text-foreground"
        >
          {error}
        </span>
      )}
    </label>
  );
}
