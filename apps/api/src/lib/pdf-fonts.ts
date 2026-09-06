import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PDFKit's built-in "Helvetica"/"Helvetica-Bold" are the standard-14
 * PDF fonts — WinAnsiEncoding only, no glyphs outside Latin-1. Confirmed
 * directly (not assumed) that this produces silently-corrupted, not
 * missing, output for anything outside that range: rendering a Japanese
 * treatment name through "Helvetica" throws no exception but emits
 * garbled, unrelated characters (verified against the actual pdfkit
 * behavior before writing this file). Every PDF this app generates can
 * contain user-entered free text — treatment names, symptom notes — and
 * EMBR is a bilingual English/Japanese product, so this is a real,
 * reachable path, not a hypothetical one.
 *
 * Noto Sans JP is Google's own official, SIL OFL-1.1-licensed font,
 * fetched from google/fonts' canonical repository (not a smaller,
 * unvetted npm package) — see assets/fonts/NotoSansJP-OFL.txt. Its
 * Latin glyphs are also used for all-English content, so this is the
 * only font registered; there is no per-script switching to get wrong.
 *
 * This is a single variable font file (one file spans the whole weight
 * axis), not separate regular/bold statics — Google's font repository
 * doesn't publish static weights for this family at all. PDFKit has no
 * reliable, documented way to select a variation-axis instance: the
 * `registerFont(name, src, family)` third parameter is for picking a
 * named family out of a font *collection* (.ttc/.dfont), not a
 * variable-font weight — confirmed directly by reading pdfkit's own
 * registerFont implementation. Attempting to (ab)use it for weight
 * selection was tried and produced glyph-substitution corruption (a
 * *different* corruption bug, e.g. "Bold" rendering as "old" with the
 * B silently dropped) — worse than not having a distinct bold weight
 * at all. Every heading in this app's PDFs therefore renders at the
 * font's own default weight, relying on font size (already how these
 * documents distinguish headings) rather than boldness for hierarchy.
 * A real static-weight pair, if ever sourced from a trustworthy
 * provider, should replace this — not a cleverer way to fake it from
 * one file.
 */
const UNICODE_FONT_PATH = path.join(__dirname, "../../assets/fonts/NotoSansJP-Variable.ttf");

/** Registers the Unicode-safe font under both the name used for body
 * text and the name previously used for "bold" headings, so call sites
 * that still say `.font("EmbrBody")` / `.font("EmbrHeading")` don't
 * need to know they now resolve to the same file — see this module's
 * own doc comment for why a real distinct bold isn't available yet. */
export const EMBR_PDF_BODY_FONT = "EmbrBody";
export const EMBR_PDF_HEADING_FONT = "EmbrHeading";

export function registerEmbrPdfFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(EMBR_PDF_BODY_FONT, UNICODE_FONT_PATH);
  doc.registerFont(EMBR_PDF_HEADING_FONT, UNICODE_FONT_PATH);
}
