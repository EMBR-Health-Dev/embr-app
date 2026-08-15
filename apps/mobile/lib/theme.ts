/**
 * EMBR mobile design tokens. Every value here traces back to the
 * approved web palette (navy #0f1b2d, bone #f4f1ea, brass #b8974f,
 * teal #3a6b6a) — see apps/web/tailwind.config.ts.
 *
 * Deliberately semantic, not literal color names — "accent" not
 * "brass," "textPrimary" not "navy" — so a future palette change is
 * one edit here, not a find-and-replace across every screen. Applied
 * across the entire app as of the design-system retrofit milestone —
 * confirmed via a full grep sweep that no hardcoded hex literal
 * remains anywhere outside this file (a handful of generic Tailwind-
 * gray/blue/red defaults — #6B7280, #9CA3AF, #2563EB, #DC2626, and
 * so on — were mapped onto the closest existing semantic token rather
 * than left as-is or given new one-off tokens; #B08D57 in trends.tsx
 * was a manual drift from the real brass #b8974f, corrected to the
 * real value in the process, not just tokenized as-is).
 */
export const theme = {
  colors: {
    background: "#f4f1ea", // bone
    surface: "#ffffff",
    surfaceElevated: "#faf8f4", // a hair off bone, for subtle layering without a border
    textPrimary: "#0f1b2d", // navy
    textSecondary: "#0f1b2d99", // navy at ~60% — matches web's text-navy/60 convention
    textMuted: "#0f1b2d80", // navy at ~50%
    accent: "#b8974f", // brass
    accentSoft: "#b8974f26", // brass at ~15%, for selected-state fills/backgrounds
    border: "#0f1b2d1a", // navy at ~10%
    borderStrong: "#0f1b2d33", // navy at ~20%
    success: "#3a6b6a", // teal — EMBR has no separate "green," teal fills this role. Also EMBR's link/interactive-text color, matching web's consistent text-teal underline convention.
    successSoft: "#3a6b6a1a", // teal at ~10%, for soft badge backgrounds (e.g. a "this device" indicator) — same pattern as accentSoft below, just the other brand color
    error: "#b3261e",
    selected: "#0f1b2d", // navy — a fully-selected/filled state, e.g. chip.tsx's active fill
  },
} as const;

export type ThemeColor = keyof typeof theme.colors;
