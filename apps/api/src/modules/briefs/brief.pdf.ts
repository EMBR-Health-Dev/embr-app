import PDFDocument from "pdfkit";
import type { ClinicalBriefDto } from "@embr/types";
import {
  EMBR_PDF_BODY_FONT,
  EMBR_PDF_HEADING_FONT,
  registerEmbrPdfFonts,
} from "../../lib/pdf-fonts.js";
import {
  categoryLabel,
  pdfStrings,
  severityLabel,
  treatmentCategoryLabel,
} from "./brief-locale.js";
import {
  PDF_ACCENT,
  PDF_INK,
  PDF_INK_FAINT,
  PDF_INK_MUTED,
  PDF_PLUM,
  PDF_SEVERITY_FILL,
  PDF_TINT,
} from "../../lib/pdf-palette.js";
import { EMBR_WORDMARK } from "../../lib/brand-wordmark.js";

// Palette shared with the summary export: see lib/pdf-palette.ts.
const INK = PDF_INK;
const INK_MUTED = PDF_INK_MUTED;
const INK_FAINT = PDF_INK_FAINT;
const ACCENT = PDF_ACCENT;
const PLUM = PDF_PLUM;
const SEVERITY_ORDER = ["MILD", "MODERATE", "SEVERE"] as const;

// The recurring "signal" mark from the brand's visual language — a
// single point, not a bullet character — set immediately before every
// section label. Purely a typographic/layout device: it carries no
// data-dependent meaning and never varies by what a section contains,
// so it can't be read as flagging or scoring anything.
const SIGNAL_DOT_RADIUS = 2;
const LEFT_MARGIN = 50;
const RIGHT_MARGIN = 545;

// A heading never sits alone at the foot of a page: if fewer than this
// many points are left, it starts the next page with its content.
const HEADING_KEEP_WITH_NEXT = 90;

function sectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  if (doc.y > doc.page.height - doc.page.margins.bottom - HEADING_KEEP_WITH_NEXT) {
    doc.addPage();
  }
  const y = doc.y;
  doc
    .fillColor(ACCENT)
    .circle(LEFT_MARGIN + SIGNAL_DOT_RADIUS, y + 5, SIGNAL_DOT_RADIUS)
    .fill();
  doc
    .fillColor(PLUM)
    .fontSize(10.5)
    .font(EMBR_PDF_HEADING_FONT)
    .text(label.toUpperCase(), LEFT_MARGIN + 10, y, {
      characterSpacing: 0.8,
    });
  doc.x = LEFT_MARGIN;
  doc.moveDown(0.6);
}

/** One symptom's count as a bar split by severity, sized against the
 * most logged symptom. The same numbers are printed beside it, so the
 * bar adds a picture, never information that exists only in colour. */
function severityBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  maxWidth: number,
  count: number,
  maxCount: number,
  breakdown: Record<string, number>,
): void {
  const height = 7;
  const total = Math.max(count, 1);
  const width = (count / Math.max(maxCount, 1)) * maxWidth;
  let cursor = x;
  for (const severity of SEVERITY_ORDER) {
    const n = breakdown[severity] ?? 0;
    if (n === 0) continue;
    const w = (n / total) * width;
    doc.rect(cursor, y, w, height).fill(PDF_SEVERITY_FILL[severity]);
    cursor += w;
  }
}

/**
 * Renders a previously-generated ClinicalBrief exactly as it was
 * generated — every value here comes from the stored DTO, nothing is
 * recomputed from live symptom/cycle data and nothing calls the AI
 * again. Re-downloading a brief a year later must reproduce the same
 * document, even if the underlying logs have since been edited.
 *
 * Renders in `brief.locale` — the language it was actually generated
 * in (see ClinicalBriefDto's own doc comment on that field) — never in
 * whatever locale the downloading request happens to be in. Every
 * static label below comes from brief-locale.ts's pdfStrings(locale),
 * not a literal string in this file, so a missing translation for
 * either locale is a compile error here, not a silently-English label
 * in a Japanese document. brief.aiNarrative, brief.aiDiscussionTopics,
 * and brief.interpretation.patterns' observation/association text are
 * NOT looked up here — they were already generated/composed in
 * brief.locale at generation time (see brief.ai.ts and
 * stage4-interpretation.ts) and are rendered exactly as stored, same
 * as before this pass.
 *
 * Visual language only: every disclaimer, every "not a diagnosis" /
 * "does not assess whether a treatment is working" caveat, and every
 * conditional (which sections render, and when) is unchanged from
 * before this pass for English output specifically — see
 * brief.pdf.test.ts, which asserts on this exact English text and
 * passes unmodified against this file.
 */
export function buildClinicalBriefPdf(
  brief: ClinicalBriefDto,
  userEmail: string,
): PDFKit.PDFDocument {
  const locale = brief.locale ?? "en";
  const t = pdfStrings(locale);
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  registerEmbrPdfFonts(doc);

  // ---- Masthead ----
  // The EMBR wordmark as a small eyebrow above the actual document
  // title — the same relationship the wordmark has to a section label
  // elsewhere in this file — rather than one undifferentiated heading
  // line, so the document reads as an instrument with its own
  // identity, not a generic report with a logo pasted on top. "EMBR"
  // itself is never translated, in either locale — the same brand-name
  // treatment the rest of the product already uses.
  // The wordmark is drawn from the master asset (assets/brand), not set
  // as text, so it matches the website and the apps exactly.
  // A tinted band behind the masthead, full page width.
  doc.rect(0, 0, doc.page.width, 150).fill(PDF_TINT);
  doc.y = 44;
  const wordmarkHeight = 9;
  const scale = wordmarkHeight / EMBR_WORDMARK.height;
  doc
    .save()
    .translate(doc.x - EMBR_WORDMARK.x * scale, doc.y - EMBR_WORDMARK.y * scale)
    .scale(scale)
    .path(EMBR_WORDMARK.path)
    .fill(PLUM)
    .restore();
  doc.y += wordmarkHeight + 8;
  doc.fillColor(INK).fontSize(22).font(EMBR_PDF_HEADING_FONT).text(t.documentTitle);
  doc.moveDown(0.6);

  doc
    .fillColor(PLUM)
    .fontSize(8)
    .font(EMBR_PDF_HEADING_FONT)
    .text(t.observationPeriodLabel, { characterSpacing: 0.8 });
  doc.moveDown(0.15);
  doc
    .fillColor(INK)
    .fontSize(12)
    .font(EMBR_PDF_BODY_FONT)
    .text(`${brief.fromDate}  →  ${brief.toDate}`);
  doc.y = Math.max(doc.y, 150) + 16;

  const generatedAtUtc = new Date(brief.createdAt).toISOString().slice(0, 16).replace("T", " ");
  doc
    .fontSize(9)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK_MUTED)
    .text(`${t.preparedFor(userEmail)}  ·  ${t.generatedAt(generatedAtUtc)}`);
  doc.moveDown(0.4).fontSize(9).fillColor(INK_MUTED).text(t.topDisclaimer);

  doc.moveDown(1);
  doc
    .strokeColor(ACCENT)
    .lineWidth(1)
    .moveTo(LEFT_MARGIN, doc.y)
    .lineTo(RIGHT_MARGIN, doc.y)
    .stroke();
  doc.moveDown(1);

  // ---- AI narrative ----
  // brief.aiNarrative was generated in `locale` at generation time —
  // rendered exactly as stored, not re-localized here.
  sectionHeading(doc, t.summaryHeading);
  doc
    .fontSize(10)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK)
    .text(brief.aiNarrative, { align: "left" });
  // Says which parts are AI-written (this summary and the questions)
  // as opposed to the deterministic sections, and what the model saw.
  doc.moveDown(0.3).fontSize(8).fillColor(INK_MUTED).text(t.aiAuthorshipNote);
  doc.moveDown(1);

  // ---- Grounded in your data (the deterministic findings the AI actually cited) ----
  // Only rendered when both fields are present and non-empty — see
  // ClinicalBriefDto's own doc comment on citedPatternIds for why an
  // empty array (the AI cited nothing) is a real, distinct fact from
  // null (a brief predating this field). Renders the same
  // observation/association text the web and mobile "Grounded in your
  // data" section does — never re-derived or reworded here. Already in
  // `locale` — see stage4-interpretation.ts.
  if (brief.citedPatternIds && brief.citedPatternIds.length > 0 && brief.interpretation) {
    sectionHeading(doc, t.groundedInHeading);
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
    for (const id of brief.citedPatternIds) {
      const pattern = brief.interpretation.patterns.find((entry) => entry.id === id);
      // Should always resolve — see the same reasoning in page.tsx/
      // brief.tsx. Skipped rather than throwing, so one unexpected id
      // can't break PDF generation for the rest of the brief.
      if (!pattern) continue;
      const text = pattern.association
        ? `${pattern.observation} ${pattern.association}`
        : pattern.observation;
      doc.text(`•  ${text}`, { indent: 0 });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.8);
  }

  // ---- Discussion topics ----
  // brief.aiDiscussionTopics was generated in `locale` — rendered as
  // stored.
  sectionHeading(doc, t.questionsHeading);
  brief.aiDiscussionTopics.forEach((topic, i) => {
    const y = doc.y;
    doc
      .fontSize(10)
      .font(EMBR_PDF_HEADING_FONT)
      .fillColor(PLUM)
      .text(`${i + 1}.`, LEFT_MARGIN + 10, y, { width: 18 });
    doc
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK)
      .text(topic, LEFT_MARGIN + 30, y, { width: RIGHT_MARGIN - LEFT_MARGIN - 30 });
    doc.x = LEFT_MARGIN;
    doc.moveDown(0.3);
  });
  doc.moveDown(0.8);

  // ---- Symptom frequency ----
  // Labeled "Symptom Signals" in English — the same "signal"
  // vocabulary the rest of the product already uses for logged data
  // (see apps/web's copy) — this section's content and computation are
  // unchanged, only the heading text. See brief-locale.ts's own doc
  // comment on why the Japanese heading instead reuses
  // Brief.symptomFrequency's already-established "症状の頻度" rather
  // than a literal, less natural translation of "Signals."
  sectionHeading(doc, t.symptomSignalsHeading);
  if (brief.symptomSummary.length === 0) {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK_MUTED).text(t.noSymptomsText);
  } else {
    // Legend: which shade is which severity.
    let legendX = LEFT_MARGIN + 10;
    const legendY = doc.y;
    doc.fontSize(8).font(EMBR_PDF_BODY_FONT);
    for (const severity of SEVERITY_ORDER) {
      doc.rect(legendX, legendY + 1.5, 8, 6).fill(PDF_SEVERITY_FILL[severity]);
      const label = severityLabel(severity, locale);
      doc.fillColor(INK_MUTED).text(label, legendX + 11, legendY, { lineBreak: false });
      legendX += 11 + doc.widthOfString(label) + 14;
    }
    doc.x = LEFT_MARGIN;
    doc.y = legendY + 16;
    const maxCount = Math.max(...brief.symptomSummary.map((s) => s.count));
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { category, count, severityBreakdown } of brief.symptomSummary) {
      const bySeverity = Object.entries(severityBreakdown)
        .map(([severity, n]) =>
          locale === "ja"
            ? `${severityLabel(severity, locale)}${n}件`
            : `${n} ${severityLabel(severity, locale)}`,
        )
        .join(locale === "ja" ? "、" : ", ");
      doc
        .fillColor(INK)
        .text(`${categoryLabel(category, locale)}`, { continued: true, width: 300 });
      doc.fillColor(INK_MUTED).text(`  ${t.occurrenceLine(count, bySeverity)}`);
      severityBar(doc, LEFT_MARGIN, doc.y + 2, 300, count, maxCount, severityBreakdown);
      doc.y += 14;
    }
  }

  doc.moveDown(1);

  // ---- Frequency comparison vs. the immediately preceding period ----
  // Only rendered when present — see ClinicalBriefDto's own doc
  // comment: null (a brief generated before this field existed) is
  // deliberately different from an empty array (the comparison ran
  // and found nothing to report), and neither older briefs nor a
  // genuinely-empty comparison need a PDF section for it.
  if (brief.frequencyComparison && brief.frequencyComparison.length > 0) {
    sectionHeading(doc, t.comparedWithPreviousHeading);
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { category, currentCount, previousCount } of brief.frequencyComparison) {
      doc
        .fillColor(INK)
        .text(`${categoryLabel(category, locale)}`, { continued: true, width: 300 });
      doc.fillColor(INK_MUTED).text(`  ${t.frequencyComparisonLine(currentCount, previousCount)}`);
    }
    doc.moveDown(1);
  }

  // ---- Ongoing symptoms (persistent across both periods, descriptive only) ----
  // Derived purely from frequencyComparison above — no new counting.
  // Only rendered when non-empty; see ClinicalBriefDto's own doc
  // comment for why null/empty-array are distinguished here.
  // Descriptive only: "remained present," never "your X problem is
  // persistent and requires treatment" — the same observation-not-
  // interpretation framing every other deterministic section here
  // uses, in both locales.
  if (brief.persistentSymptoms && brief.persistentSymptoms.length > 0) {
    sectionHeading(doc, t.ongoingSymptomsHeading);
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
    for (const category of brief.persistentSymptoms) {
      doc.text(t.persistentSymptomLine(categoryLabel(category, locale)));
    }
    doc.moveDown(1);
  }

  // ---- Night sweats recalled in the morning (its own count) ----
  // Never merged into the symptom counts above; a breakdown only from
  // 7 answered mornings (see night-sweats-recall.ts). Skipped for a
  // brief that predates the field or has no answered mornings.
  if (brief.nightSweatsRecall && brief.nightSweatsRecall.morningsAnswered > 0) {
    const { morningsAnswered, breakdown } = brief.nightSweatsRecall;
    sectionHeading(doc, t.nightSweatsRecallHeading);
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
    doc.text(t.nightSweatsAnsweredLine(morningsAnswered));
    doc.text(breakdown ? t.nightSweatsBreakdownLine(breakdown) : t.nightSweatsFewAnswersNote);
    doc.fillColor(INK_MUTED).text(t.nightSweatsSeparateNote);
    doc.moveDown(1);
  }

  // ---- Observed patterns (symptom co-occurrence, descriptive only) ----
  // Only rendered when present — coOccurrence is null both for a
  // brief predating this field and for one where no pair reached the
  // existing threshold; see ClinicalBriefDto's own doc comment for
  // why those two cases aren't distinguished here. Descriptive only:
  // "reported on the same day," never "triggers" or "causes" — the
  // same observation-not-causation framing web and mobile use, in both
  // locales.
  if (brief.coOccurrence) {
    const { categoryA, categoryB, days } = brief.coOccurrence;
    sectionHeading(doc, t.patternsNoticedHeading);
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK)
      .text(
        t.coOccurrenceLine(
          categoryLabel(categoryA, locale),
          categoryLabel(categoryB, locale),
          days,
        ),
      );
    doc.moveDown(1);
  }

  // ---- Cycle summary ----
  sectionHeading(doc, t.cycleSummaryHeading);
  const { averageCycleLengthDays, cycleCount, periodDaysLogged } = brief.cycleSummary;
  doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
  if (averageCycleLengthDays === null) {
    doc.text(t.notEnoughCycleDataText);
  } else {
    doc.text(t.averageCycleLengthLine(averageCycleLengthDays, cycleCount));
  }
  doc.fillColor(INK_MUTED).text(t.periodDaysLoggedLine(periodDaysLogged));

  doc.moveDown(1);

  // ---- Treatments (deterministic snapshot, no AI involvement) ----
  sectionHeading(doc, t.treatmentsHeading);
  if (brief.treatmentSummary.length === 0) {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK_MUTED).text(t.noTreatmentsText);
  } else {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { name, category, startDate, endDate } of brief.treatmentSummary) {
      const dateRange = `${startDate} – ${endDate ?? t.ongoingLabel}`;
      doc.fillColor(INK).text(`${name}`, { continued: true, width: 300 });
      doc.fillColor(INK_MUTED).text(`  ${treatmentCategoryLabel(category, locale)}, ${dateRange}`);
    }
  }
  doc.moveDown(0.4);
  doc.fontSize(9).font(EMBR_PDF_BODY_FONT).fillColor(INK_MUTED).text(t.treatmentSafetyNote);

  // ---- Observed changes after starting treatment (deterministic, no AI involvement) ----
  // Only rendered when non-null and non-empty — unlike coOccurrence,
  // an empty array here is a real fact ("no treatments started this
  // period"), so it's distinguished from null the same way
  // frequencyComparison already is; see ClinicalBriefDto's own doc
  // comment. Observational only: "X logs before, Y after," never
  // "the treatment reduced symptoms" — see treatment-impact.ts's own
  // doc comment on why any efficacy-claim language is explicitly out
  // of scope here, in both locales.
  if (brief.treatmentImpact && brief.treatmentImpact.length > 0) {
    doc.moveDown(1);
    sectionHeading(doc, t.treatmentImpactHeading);
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { name, before, after, insufficientData } of brief.treatmentImpact) {
      doc.fillColor(INK).text(name);
      if (insufficientData) {
        doc.fillColor(INK_MUTED).text(`  ${t.treatmentImpactInsufficientText}`);
      } else {
        doc
          .fillColor(INK_MUTED)
          .text(
            `  ${t.treatmentImpactLine(before.logCount, before.days, after.logCount, after.days)}`,
          );
      }
    }
    doc.moveDown(0.4);
    doc.fontSize(9).font(EMBR_PDF_BODY_FONT).fillColor(INK_MUTED).text(t.treatmentSafetyNote);
  }

  // ---- Fine print: what this document is and isn't ----
  // A single, restrained closing line reinforcing the masthead's own
  // disclaimer — the same three-way distinction (reported data vs.
  // observed pattern vs. clinical interpretation) the brand direction
  // asks this document to make clearer, stated once more at the point
  // a reader is most likely to be deciding what to do with the
  // document, not just at the top before they've read it. Same
  // distinction, same absolute "that judgment belongs to the
  // clinician" framing, in both locales — see brief-locale.ts's own
  // doc comment on this specific translation.
  doc.moveDown(1.2);
  doc
    .strokeColor(INK_FAINT)
    .lineWidth(0.5)
    .moveTo(LEFT_MARGIN, doc.y)
    .lineTo(RIGHT_MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.6);
  doc.fontSize(8).font(EMBR_PDF_BODY_FONT).fillColor(INK_MUTED).text(t.closingDisclaimer);

  return doc;
}
