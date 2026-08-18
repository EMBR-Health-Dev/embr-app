# EMBR Design Tokens

Source of truth: **EMBR Brand Guidelines v1.0**. Palette hex values, type
families, and the type scale are taken directly from the guidelines — not
interpreted. Everything under "Implementation assumptions" was **not**
specified by the guidelines and was established here, once, to be reused
consistently rather than invented per-screen.

## Two-layer token architecture

**Layer 1 — Palette** (`graphite-*`, `lilac-*`, `rose-500`, `ice-500`,
`pearl-50`): the raw brand hex values, exactly as specified in the
guidelines. Rarely referenced directly by components.

**Layer 2 — Semantic** (`background`, `foreground`, `surface`, `muted`,
`primary`, `border`, `accent`, `destructive`, plus their `-foreground`/
`-hover` pairs): what component code should actually use. Same token
_names_ in `apps/web` and `apps/admin` — only the CSS variable _values_
differ per app (light theme vs. admin's dark theme), so shared component
code never needs to know which app it's rendering in.

Both layers are defined as CSS custom properties in each app's
`globals.css`, as **"R G B" space-separated triplets** (not hex), which is
what lets Tailwind's opacity modifiers work correctly —
`rgb(var(--primary) / 50%)` for e.g. `bg-primary/50`. `tailwind.config.ts`
(identical in both apps) wires each token name to
`rgb(var(--css-var) / <alpha-value>)` via a small `withOpacity()` helper.

## Layer 1 — Palette (from brand guidelines, do not modify without updating the guidelines)

| Token             | Hex            | Usage                                                               |
| ----------------- | -------------- | ------------------------------------------------------------------- |
| `graphite-900`    | `#2A1F39`      | Primary brand color — headlines, nav, primary text                  |
| `graphite-700`    | `#4A4058`      | Strong secondary text                                               |
| `graphite-500`    | `#746B82`      | Secondary text                                                      |
| `graphite-300`    | `#B8B2C1`      | Borders, disabled states                                            |
| `graphite-100`    | `#F1EEF4`      | Subtle surfaces, dividers                                           |
| `lilac-500`       | `#A888B6`      | Primary accent — buttons, links, interactive elements, focus states |
| `lilac-600`       | `#9270A0`      | Accent hover/active state                                           |
| `lilac-100`…`400` | see guidelines | Accent surface tints                                                |
| `rose-500`        | `#C88AA1`      | Alerts, form validation, destructive actions                        |
| `ice-500`         | `#EEF4F9`      | Success messages, informational cards                               |
| `pearl-50`        | `#FAF7FB`      | Page background, card surfaces                                      |

## Layer 2 — Semantic tokens

| Semantic token                                     | Web (light)                                    | Admin (dark)                     | Maps to                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background` / `foreground`                        | `pearl-50` / `graphite-900`                    | `graphite-900` / `pearl-50`      | Guidelines' stated page-background/primary-text usage                                                                                                                                                                                                |
| `surface` / `surface-foreground`                   | same as background                             | same as background               | Guidelines give only one light surface tone — no second shade exists to differentiate cards from page background, so layering comes from `border`, not an extra shade or a shadow (matches "restrained... prefer subtle borders over large shadows") |
| `muted` / `muted-foreground`                       | `graphite-100` / `graphite-500`                | `graphite-700` / `graphite-300`  | Guidelines' own extended Graphite scale                                                                                                                                                                                                              |
| `primary` / `primary-hover` / `primary-foreground` | `lilac-500` / `lilac-600` / **`graphite-900`** | same                             | Guidelines specify Lilac 500 for buttons; the _text-on-button_ color is unstated — `graphite-900` chosen over `pearl-50` for contrast, see below                                                                                                     |
| `border`                                           | `graphite-300`                                 | `graphite-700` (same as `muted`) | Web: guidelines' scale. Admin: a solid, moderately-light dark tone rather than `pearl-50` at low opacity, so the plain `border-border` class (no opacity modifier) works the same way in both themes instead of admin needing its own convention     |
| `border-subtle`                                    | `graphite-100`                                 | —                                | Softer divider variant, web only so far                                                                                                                                                                                                              |
| `accent` / `accent-foreground`                     | `ice-500` / `graphite-900`                     | same                             | Guidelines' "informational cards" usage                                                                                                                                                                                                              |
| `destructive` / `destructive-foreground`           | `rose-500` / `graphite-900`                    | same                             | Guidelines' "alerts... destructive actions"                                                                                                                                                                                                          |
| `ring`                                             | `lilac-500`                                    | same                             | Focus rings — not specified by guidelines, chosen to match `primary`                                                                                                                                                                                 |

## Verified contrast ratios (WCAG relative luminance, computed — not assumed)

The guidelines state minimums (body text <18px: 4.5:1, large text: 3:1,
interactive components: 3:1) but don't pre-verify which token combinations
meet them.

| Foreground     | Background                          | Ratio   | Meets 4.5:1? | Meets 3:1? |
| -------------- | ----------------------------------- | ------- | ------------ | ---------- |
| `graphite-900` | `pearl-50`                          | 14.60:1 | ✅           | ✅         |
| `graphite-700` | `pearl-50`                          | 9.13:1  | ✅           | ✅         |
| `graphite-500` | `pearl-50`                          | 4.74:1  | ✅ (barely)  | ✅         |
| `graphite-900` | `lilac-500`                         | 5.07:1  | ✅           | ✅         |
| `graphite-900` | `lilac-600`                         | 3.73:1  | ❌           | ✅         |
| `pearl-50`     | `lilac-500`                         | 2.88:1  | ❌           | ❌         |
| `graphite-900` | `rose-500`                          | 5.62:1  | ✅           | ✅         |
| `pearl-50`     | `rose-500`                          | 2.60:1  | ❌           | ❌         |
| `graphite-900` | `ice-500`                           | 14.00:1 | ✅           | ✅         |
| `graphite-300` | `graphite-700` (admin muted/border) | 4.70:1  | ✅           | ✅         |
| `graphite-900` | `graphite-100`                      | 13.50:1 | ✅           | ✅         |

**Two real findings from this, not resolved by inventing a new color:**

1. **`primary-foreground` is `graphite-900`, not `pearl-50`.** `pearl-50`
   on `lilac-500` — the first thing that seems natural, matching a
   light-text-on-solid-button pattern — only measures 2.88:1, failing
   even the interactive-component minimum. `graphite-900` measures
   5.07:1. On hover (`lilac-600`), `graphite-900` text drops to 3.73:1 —
   passes the interactive-component threshold (3:1) but not the
   stricter body-text one; acceptable since a button is the
   interactive-component case, not body text.
2. **`rose-500` (the guidelines' own "form validation"/destructive
   color) fails as text or a border on a light background** — 2.60:1 on
   `pearl-50`, under the guidelines' own 3:1 minimum — but passes
   excellently as a **solid fill** with `graphite-900` text on top
   (5.62:1). So `destructive` as a semantic token (solid button/badge
   fill) works fine; using `rose-500` directly as inline text or a thin
   border on a light surface does not, and there's no darker rose in the
   palette to substitute. Components needing an error/destructive
   _inline text or border_ treatment on a light background should use
   `graphite-900` text with a `destructive`-colored accent element
   (icon, left-border, small dot) rather than `rose-500` text itself.

## Implementation assumptions (not specified by brand guidelines — flagged as assumptions, not confirmed brand requirements)

These are reasonable interpretations of the guidelines' stated principles
("calm by default," "premium," "restrained... rather than heavily card
based or overly decorative," "subtle borders and restrained elevation over
large shadows," "generous whitespace"), not guideline facts.

- **Border radius**: `6px` (sm, inputs/chips) / `8px` (default, buttons) /
  `12px` (lg, cards) — restrained, not the more rounded ~16-24px treatment
  common in consumer wellness apps.
- **Shadow**: one subtle level (`shadow-subtle`,
  `0 1px 3px 0 rgb(graphite-900 / 0.06)`), used sparingly. Most elevation
  should come from a `border-border` hairline rather than a shadow.
- **Spacing**: Tailwind's default 4px-based scale, not overridden.
  "Generous whitespace" is applied through larger per-component
  gap/padding values (e.g. `gap-6`/`gap-8`, `p-8` on cards) rather than a
  different base unit.
- **Gradients**: not used in ordinary UI. The signature gradient
  (`#2A1F39 → #6E5B82 → #A888B6`, 135°) is reserved for major brand
  moments per the guidelines — none of the screens in this migration
  qualify.

## Typography (from brand guidelines)

- **Display**: Instrument Serif — hero headlines, campaign titles, major
  section headers only. **Weight 400 only** — the typeface does not ship a
  bold/semibold weight. Use size and spacing for emphasis, not font-weight.
  Verified against `next/font/google`'s bundled font manifest before use.
- **Body**: SF Pro Display where natively available (Apple platforms
  resolve `system-ui`/`-apple-system` to it), falling back to Inter, then
  system UI. SF Pro Display is Apple-licensed and is **not** bundled as a
  web font.
- **Data/mono**: JetBrains Mono — statistics, dashboards, data
  visualization only. Verified against the font manifest.

### Type scale

| Token        | Size |
| ------------ | ---- |
| `display-xl` | 56px |
| `display-l`  | 48px |
| `display-m`  | 40px |
| `heading-xl` | 32px |
| `heading-l`  | 28px |
| `heading-m`  | 24px |
| `body-l`     | 18px |
| `body-m`     | 16px |
| `body-s`     | 14px |
| `caption`    | 12px |
| `overline`   | 10px |

## Where these are implemented

- Web: `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`,
  `apps/web/src/app/layout.tsx` (font loading)
- Admin: `apps/admin/tailwind.config.ts`, `apps/admin/src/app/globals.css`,
  `apps/admin/src/app/layout.tsx`
- Mobile: `apps/mobile/lib/theme.ts` — separate migration, since mobile has
  no Tailwind/CSS variables; React Native `StyleSheet` usages reference
  this module's exported constants directly instead
