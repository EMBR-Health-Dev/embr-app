import PDFDocument from "pdfkit";
import type { CycleEntry, SymptomLog, Treatment } from "../../generated/prisma/index.js";
import { computeCycleLengths } from "../../lib/cycle-length.js";
import { localDayEndLabel, localDayStartLabel } from "../../lib/local-day-label.js";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";
import {
  EMBR_PDF_BODY_FONT,
  EMBR_PDF_HEADING_FONT,
  registerEmbrPdfFonts,
} from "../../lib/pdf-fonts.js";
import { PDF_INK, PDF_INK_FAINT, PDF_INK_MUTED, PDF_INK_SECONDARY } from "../../lib/pdf-palette.js";
import { EMBR_WORDMARK } from "../../lib/brand-wordmark.js";

export function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** categoryLabel (above) does a generic underscore-to-title-case
 * transform, which is correct for symptom categories but would render
 * "HRT" as "Hrt" — a real acronym, not a word to title-case. Small and
 * local to this file rather than changing the shared helper, matching
 * the exact same fix (and the exact same reasoning for keeping it
 * local rather than shared) brief.pdf.ts already applies for its own
 * treatment category rendering. */
function treatmentCategoryLabel(category: string): string {
  if (category === "HRT") return "HRT";
  return categoryLabel(category);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface SummaryInput {
  userEmail: string;
  from?: Date;
  to?: Date;
  symptomLogs: SymptomLog[];
  cycleEntries: CycleEntry[];
  treatments: Treatment[];
}

// Thin wrapper: the canonical computation now lives in
// lib/symptom-frequency.ts (shared with brief.service.ts). This file
// only ever reads {category, count} — severityBreakdown, which the
// canonical helper also returns, is simply not destructured below, the
// same as it always has been.
function symptomFrequency(logs: SymptomLog[]): Array<{ category: string; count: number }> {
  return computeSymptomFrequency(logs);
}

// Thin wrapper: the canonical computation now lives in
// lib/cycle-length.ts (shared with trends.service.ts). This file only
// ever needs the bare day-count array, so the richer
// {fromDate, toDate, days} shape is mapped down to .days here — the
// same bare number[] this function has always returned.
export function cycleLengths(entries: CycleEntry[]): number[] {
  const periodStartDates = entries.filter((e) => e.isPeriodStart).map((e) => e.date);
  return computeCycleLengths(periodStartDates).map((interval) => interval.days);
}

/**
 * Returns an unstarted PDFDocument — the caller pipes it to the
 * response and calls .end(), so this stays a pure builder rather than
 * coupling to Express.
 */
export function buildClinicianSummaryPdf(input: SummaryInput): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  registerEmbrPdfFonts(doc);

  // The master wordmark as a small eyebrow, as on the EMBR BRIEF.
  const wordmarkHeight = 9;
  const scale = wordmarkHeight / EMBR_WORDMARK.height;
  doc
    .save()
    .translate(doc.x - EMBR_WORDMARK.x * scale, doc.y - EMBR_WORDMARK.y * scale)
    .scale(scale)
    .path(EMBR_WORDMARK.path)
    .fill(PDF_INK)
    .restore();
  doc.y += wordmarkHeight + 8;
  doc.fillColor(PDF_INK).fontSize(20).font(EMBR_PDF_HEADING_FONT).text("EMBR Health Summary");
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(PDF_INK_SECONDARY)
    .text(`Prepared for ${input.userEmail}`)
    .text(
      `Range: ${input.from ? localDayStartLabel(input.from) : "all time"} to ${input.to ? localDayEndLabel(input.to) : "present"}`,
    )
    .text(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  doc
    .moveDown(0.5)
    .fontSize(9)
    .fillColor(PDF_INK_MUTED)
    .text(
      "This is a personal tracking record, not a diagnosis. For discussion with your provider.",
    );

  doc.moveDown(1.2);
  doc.strokeColor(PDF_INK_FAINT).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  // ---- Symptom frequency ----
  doc.fillColor(PDF_INK).fontSize(14).font(EMBR_PDF_HEADING_FONT).text("Symptom frequency");
  doc.moveDown(0.4);
  const frequency = symptomFrequency(input.symptomLogs);
  if (frequency.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(PDF_INK_SECONDARY)
      .text("No symptoms logged in this range.");
  } else {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { category, count } of frequency) {
      doc.fillColor(PDF_INK).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc.fillColor(PDF_INK_SECONDARY).text(`  ${count} occurrence${count === 1 ? "" : "s"}`);
    }
  }

  doc.moveDown(1);

  // ---- Cycle summary ----
  doc.fillColor(PDF_INK).fontSize(14).font(EMBR_PDF_HEADING_FONT).text("Cycle summary");
  doc.moveDown(0.4);
  const lengths = cycleLengths(input.cycleEntries);
  if (lengths.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(PDF_INK_SECONDARY)
      .text("Not enough period-start entries in this range to compute cycle length.");
  } else {
    const average = Math.round(lengths.reduce((sum, l) => sum + l, 0) / lengths.length);
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(PDF_INK)
      .text(
        `Average cycle length: ${average} days (${lengths.length} cycle${lengths.length === 1 ? "" : "s"} recorded)`,
      );
  }

  doc.moveDown(1);

  // ---- Recent entries table ----
  doc.fillColor(PDF_INK).fontSize(14).font(EMBR_PDF_HEADING_FONT).text("Symptom log");
  doc.moveDown(0.4);
  if (input.symptomLogs.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(PDF_INK_SECONDARY)
      .text("No entries in this range.");
  } else {
    doc.fontSize(9).font(EMBR_PDF_BODY_FONT);
    for (const log of input.symptomLogs) {
      if (doc.y > 760) doc.addPage();
      doc
        .fillColor(PDF_INK)
        .text(
          `${formatDate(log.occurredAt)}  ${categoryLabel(log.category)}  (${log.severity.toLowerCase()})`,
        );
      if (log.notes) doc.fillColor(PDF_INK_SECONDARY).text(`  ${log.notes}`, { indent: 10 });
    }
  }

  doc.moveDown(1);

  // ---- Treatment history ----
  // Notes are included here — unlike BRIEF's treatmentSummary, which
  // deliberately excludes them (see treatment-summary.ts's doc
  // comment: an AI-narrated document showing treatment notes next to
  // symptom-frequency trends risks implying causation in the
  // narrative). This is a raw, non-AI data export — no narrative
  // layer interprets or connects these sections — and every other
  // record type here (symptom logs above, cycle entries via the CSV
  // export) already includes the user's own notes. Excluding them
  // only for treatments would be an inconsistent surprise in what's
  // supposed to be a complete personal record.
  doc.fillColor(PDF_INK).fontSize(14).font(EMBR_PDF_HEADING_FONT).text("Treatment history");
  doc.moveDown(0.4);
  if (input.treatments.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(PDF_INK_SECONDARY)
      .text("No treatments logged in this range.");
  } else {
    doc.fontSize(9).font(EMBR_PDF_BODY_FONT);
    for (const treatment of input.treatments) {
      if (doc.y > 760) doc.addPage();
      const dateRange = `${formatDate(treatment.startDate)} – ${treatment.endDate ? formatDate(treatment.endDate) : "Ongoing"}`;
      doc
        .fillColor(PDF_INK)
        .text(`${treatment.name}  ${treatmentCategoryLabel(treatment.category)}  ${dateRange}`);
      if (treatment.notes)
        doc.fillColor(PDF_INK_SECONDARY).text(`  ${treatment.notes}`, { indent: 10 });
    }
  }
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(PDF_INK_MUTED)
    .text(
      "This reflects what you've logged. It does not assess whether a treatment is working or" +
        " make treatment recommendations.",
    );

  return doc;
}
