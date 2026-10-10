/**
 * EMBR palette for generated PDFs (the EMBR BRIEF and the summary
 * export), as hex because PDFKit has no CSS custom properties. Same
 * values as apps/web's tokens (docs/design-tokens.md), kept to
 * restrained roles: plum for headings and primary text, graphite for
 * secondary and meta text, a graphite hairline for rules, and one
 * sparing lilac accent. Nothing in a PDF depends on colour to be read:
 * every value here prints as a distinct grey.
 */
export const PDF_INK = "#2A1F39"; // plum (graphite-900): headings, primary text
export const PDF_INK_SECONDARY = "#4A4058"; // graphite-700: body detail, notes
export const PDF_INK_MUTED = "#746B82"; // graphite-500: meta text
export const PDF_INK_FAINT = "#B8B2C1"; // graphite-300: hairline rules
export const PDF_ACCENT = "#9270A0"; // lilac-600: the one accent, used sparingly (holds up in print)

// Colour roles for the BRIEF's visual layer. Each still prints as a
// distinct grey, and every value drawn in colour is also printed as text.
export const PDF_PLUM = "#7A588A"; // lilac-700: section headings, question numbers
export const PDF_TINT = "#F1EAF5"; // lilac-100: masthead band
export const PDF_SEVERITY_FILL = {
  MILD: "#D1BDD9", // lilac-300
  MODERATE: "#A888B6", // lilac-500
  SEVERE: "#7A588A", // lilac-700
} as const;
