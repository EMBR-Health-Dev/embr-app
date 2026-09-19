"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center rounded-sm px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";
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
