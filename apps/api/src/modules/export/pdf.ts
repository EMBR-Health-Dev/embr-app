import PDFDocument from "pdfkit";
import type { CycleEntry, SymptomLog } from "../../generated/prisma/index.js";
import { computeCycleLengths } from "../../lib/cycle-length.js";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";

export function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
  const brass = "#b8974f";
  const navy = "#0f1b2d";

  doc.fillColor(navy).fontSize(20).font("Helvetica-Bold").text("EMBR — Health Summary");
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#555555")
    .text(`Prepared for ${input.userEmail}`)
    .text(
      `Range: ${input.from ? formatDate(input.from) : "all time"} to ${input.to ? formatDate(input.to) : "present"}`,
    )
    .text(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  doc
    .moveDown(0.5)
    .fontSize(9)
    .fillColor("#888888")
    .text(
      "This is a personal tracking record, not a diagnosis — for discussion with your provider.",
    );

  doc.moveDown(1.2);
  doc.strokeColor(brass).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  // ---- Symptom frequency ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Symptom frequency");
  doc.moveDown(0.4);
  const frequency = symptomFrequency(input.symptomLogs);
  if (frequency.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text("No symptoms logged in this range.");
  } else {
    doc.fontSize(10).font("Helvetica");
    for (const { category, count } of frequency) {
      doc.fillColor(navy).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc.fillColor("#555555").text(`  ${count} occurrence${count === 1 ? "" : "s"}`);
    }
  }

  doc.moveDown(1);

  // ---- Cycle summary ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Cycle summary");
  doc.moveDown(0.4);
  const lengths = cycleLengths(input.cycleEntries);
  if (lengths.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text("Not enough period-start entries in this range to compute cycle length.");
  } else {
    const average = Math.round(lengths.reduce((sum, l) => sum + l, 0) / lengths.length);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor(navy)
      .text(
        `Average cycle length: ${average} days (${lengths.length} cycle${lengths.length === 1 ? "" : "s"} recorded)`,
      );
  }

  doc.moveDown(1);

  // ---- Recent entries table ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Symptom log");
  doc.moveDown(0.4);
  if (input.symptomLogs.length === 0) {
    doc.fontSize(10).font("Helvetica").fillColor("#555555").text("No entries in this range.");
  } else {
    doc.fontSize(9).font("Helvetica");
    for (const log of input.symptomLogs) {
      if (doc.y > 760) doc.addPage();
      doc
        .fillColor(navy)
        .text(
          `${formatDate(log.occurredAt)}  ${categoryLabel(log.category)}  (${log.severity.toLowerCase()})`,
        );
      if (log.notes) doc.fillColor("#666666").text(`  ${log.notes}`, { indent: 10 });
    }
  }

  return doc;
}
