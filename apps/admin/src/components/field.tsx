"use client";

import type { InputHTMLAttributes } from "react";

export function Field({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className={`rounded-sm border bg-background px-3 py-2 text-foreground placeholder:text-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
          error ? "border-destructive" : "border-border"
        }`}
        {...props}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}
