/**
 * EMBR mobile design tokens: the same lilac/graphite palette as
 * apps/web/src/app/globals.css (EMBR Brand Guidelines v1.0), applied
 * by role, not by name: plum for structure, navigation and primary
 * actions; lilac only as an editorial accent (selected states, data
 * highlights, links); pearl for surfaces and reversed text; plum at
 * reduced opacity for secondary copy (as web's text-foreground/70 and
 * /80); rose only for errors and destructive actions, as a marker,
 * because rose-500 as text is below AA on pearl.
 *
 * Deliberately semantic, not literal color names, so a palette change
 * is one edit here, not a find-and-replace across every screen. No hex
 * literal should appear anywhere outside this file.
 *
 * Palette (hex of the web's RGB triplets):
 *   graphite-900 #2A1F39  graphite-700 #4A4058  graphite-300 #B8B2C1
 *   lilac-100 #F1EAF5  lilac-200 #E2D7EA  lilac-500 #A888B6
 *   lilac-700 #7A588A  rose-500 #C88AA1  pearl-50 #FAF7FB
 */
export const theme = {
  colors: {
    background: "#FAF7FB", // pearl-50, as web's page background
    surface: "#FAF7FB", // pearl-50: cards separate by border and spacing, not by a coloured fill
    surfaceElevated: "#F1EEF4", // graphite-100, a quiet tonal step for nested panels
    textPrimary: "#2A1F39", // plum (graphite-900): headings, structure, navigation
    textSecondary: "#2A1F39CC", // plum at 80%: body and secondary copy, 7.8:1 on pearl
    textMuted: "#2A1F39B3", // plum at 70%: meta text, 5.6:1 on pearl
    primary: "#2A1F39", // plum: primary actions are deliberate, not bright
    primaryForeground: "#FAF7FB", // pearl on plum: 14.6:1
    onAccent: "#FAF7FB", // pearl, reversed text on plum or lilac-700 fills
    accent: "#7A588A", // lilac-700: restrained emphasis and selected borders only
    accentSoft: "#F1EAF5", // lilac-100: selected-state fill
    data: "#A888B6", // lilac-500: data highlights (bars, chart marks)
    border: "#2A1F391A", // plum at 10%, card and divider lines
    borderStrong: "#B8B2C1", // graphite-300, as web's border token (inputs)
    success: "#7A588A", // lilac-700: links and confirmations (interactive), 5.5:1 on pearl
    successSoft: "#F1EAF5", // lilac-100, soft badge background
    error: "#2A1F39", // plum text; marked with `destructive` (see errorMarker)
    destructive: "#C88AA1", // rose-500: error markers and destructive actions only
    selected: "#7A588A", // lilac-700, the border of a selected chip or row
  },
} as const;

/** Error message styling, as web's field errors: graphite text with a rose left rule. */
export const errorMarker = {
  color: theme.colors.error,
  borderLeftWidth: 2,
  borderLeftColor: theme.colors.destructive,
  paddingLeft: 8,
} as const;

/** Destructive text actions (delete, remove): graphite text, rose underline. */
export const destructiveText = {
  color: theme.colors.error,
  textDecorationLine: "underline",
  textDecorationColor: theme.colors.destructive,
} as const;

export type ThemeColor = keyof typeof theme.colors;
