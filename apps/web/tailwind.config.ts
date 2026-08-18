import type { Config } from "tailwindcss";

/**
 * Wraps a CSS custom property (defined as an "R G B" triplet in
 * globals.css) so Tailwind's opacity modifiers work correctly, e.g.
 * `bg-primary/50`. See docs/design-tokens.md.
 */
function withOpacity(cssVar: string) {
  return ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue !== undefined ? `rgb(var(${cssVar}) / ${opacityValue})` : `rgb(var(${cssVar}))`;
}

const config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ---- Palette (EMBR Brand Guidelines v1.0, exact hex) ----
        // Prefer the semantic tokens below in component code — these
        // exist for the rare case a component needs a specific brand
        // color that doesn't map to a semantic role.
        graphite: {
          900: withOpacity("--color-graphite-900"),
          700: withOpacity("--color-graphite-700"),
          500: withOpacity("--color-graphite-500"),
          300: withOpacity("--color-graphite-300"),
          100: withOpacity("--color-graphite-100"),
        },
        lilac: {
          100: withOpacity("--color-lilac-100"),
          200: withOpacity("--color-lilac-200"),
          300: withOpacity("--color-lilac-300"),
          400: withOpacity("--color-lilac-400"),
          500: withOpacity("--color-lilac-500"),
          600: withOpacity("--color-lilac-600"),
        },
        rose: { 500: withOpacity("--color-rose-500") },
        ice: { 500: withOpacity("--color-ice-500") },
        pearl: { 50: withOpacity("--color-pearl-50") },

        // ---- Semantic (what components should actually use) ----
        // Same token names in web and admin; only the CSS variable
        // values differ (see each app's globals.css) — component code
        // never needs to know which theme it's rendering in.
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        surface: withOpacity("--surface"),
        "surface-foreground": withOpacity("--surface-foreground"),
        muted: withOpacity("--muted"),
        "muted-foreground": withOpacity("--muted-foreground"),
        primary: withOpacity("--primary"),
        "primary-hover": withOpacity("--primary-hover"),
        "primary-foreground": withOpacity("--primary-foreground"),
        border: withOpacity("--border"),
        "border-subtle": withOpacity("--border-subtle"),
        accent: withOpacity("--accent"),
        "accent-foreground": withOpacity("--accent-foreground"),
        destructive: withOpacity("--destructive"),
        "destructive-foreground": withOpacity("--destructive-foreground"),
        ring: withOpacity("--ring"),
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "-apple-system", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        "display-xl": ["3.5rem", { lineHeight: "1.1" }],
        "display-l": ["3rem", { lineHeight: "1.1" }],
        "display-m": ["2.5rem", { lineHeight: "1.15" }],
        "heading-xl": ["2rem", { lineHeight: "1.2" }],
        "heading-l": ["1.75rem", { lineHeight: "1.25" }],
        "heading-m": ["1.5rem", { lineHeight: "1.3" }],
        "body-l": ["1.125rem", { lineHeight: "1.5" }],
        "body-m": ["1rem", { lineHeight: "1.5" }],
        "body-s": ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        overline: ["0.625rem", { lineHeight: "1.4", letterSpacing: "0.05em" }],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "6px",
        lg: "12px",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgb(var(--color-graphite-900) / 0.06)",
      },
    },
  },
  plugins: [],
};
// Tailwind 3.4's Config type doesn't model function-value colors
// (RecursiveKeyValuePair<string,string> only accepts strings), even
// though this is a standard, well-supported runtime pattern for
// CSS-variable-driven themes. `unknown` (not `any`) as the escape
// hatch — passes the repo's no-explicit-any lint rule.
export default config as unknown as Config;
