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
 * Google publishes this family only as one variable font, and PDFKit
 * cannot pick a weight from a variable font: it renders the default
 * instance, which for Noto Sans JP is weight 100 (Thin), far too light
 * to read when printed. The two files here are static instances cut
 * from that same OFL licensed variable font with fontTools
 * (`fonttools varLib.instancer NotoSansJP-Variable.ttf wght=400` and
 * `wght=600`, with --update-name-table), which the OFL permits:
 * Regular for body text, SemiBold for headings.
 */
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const BODY_FONT_PATH = path.join(FONT_DIR, "NotoSansJP-Regular.ttf");
const HEADING_FONT_PATH = path.join(FONT_DIR, "NotoSansJP-SemiBold.ttf");

/** Registers the Unicode-safe body (Regular) and heading (SemiBold)
 * fonts under the names every PDF call site uses. */
export const EMBR_PDF_BODY_FONT = "EmbrBody";
export const EMBR_PDF_HEADING_FONT = "EmbrHeading";

export function registerEmbrPdfFonts(doc: PDFKit.PDFDocument): void {
  doc.registerFont(EMBR_PDF_BODY_FONT, BODY_FONT_PATH);
  doc.registerFont(EMBR_PDF_HEADING_FONT, HEADING_FONT_PATH);
}
