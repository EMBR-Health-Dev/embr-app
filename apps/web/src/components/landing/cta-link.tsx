import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "inverse";

// Same shape, focus ring and primary fill as components/button.tsx —
// a navigation CTA needs to be a real link (<a>), not a <button>, so it
// can't reuse Button directly, but it should read as the same control.
const base =
  "inline-flex items-center justify-center rounded-sm text-center text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border text-foreground hover:bg-muted",
  // For the dark (graphite) band — pearl outline instead of graphite.
  inverse: "border border-pearl-50/40 text-pearl-50 hover:bg-pearl-50/10",
};

// 44px minimum touch target at the default size.
const sizes = {
  md: "min-h-11 px-6 py-3",
  sm: "min-h-10 px-4 py-2",
} as const;

export function CtaLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof sizes }) {
  return <Link className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

/** The one registration entry point every landing CTA shares. */
export const START_HREF = "/register";

export const container = "mx-auto w-full max-w-6xl px-5 sm:px-8";

export function Eyebrow({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "inverse";
}) {
  return (
    <p
      className={`flex items-center gap-2 text-caption font-medium uppercase tracking-[0.14em] ${
        tone === "inverse" ? "text-lilac-300" : "text-graphite-700"
      }`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      {children}
    </p>
  );
}
