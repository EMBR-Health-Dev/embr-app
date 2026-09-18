import PDFDocument from "pdfkit";
import type { ClinicalBriefDto } from "@embr/types";
import { categoryLabel } from "../export/pdf.js";
import {
  EMBR_PDF_BODY_FONT,
  EMBR_PDF_HEADING_FONT,
  registerEmbrPdfFonts,
} from "../../lib/pdf-fonts.js";

/** categoryLabel (above) does a generic underscore-to-title-case
 * transform, which is correct for symptom categories but would render
 * "HRT" as "Hrt" — a real acronym, not a word to title-case. Small and
 * local to this file rather than changing the shared helper, which is
 * also used for symptom categories and out of scope here. */
function treatmentCategoryLabel(category: string): string {
  if (category === "HRT") return "HRT";
  return categoryLabel(category);
}

// EMBR Brand Guidelines v1.0 palette (see docs/design-tokens.md) — the
// same graphite/lilac values apps/web's Tailwind tokens resolve to,
// hardcoded here as hex because PDFKit has no CSS custom property
// support. Kept to the same restrained roles the web semantic tokens
// use: graphite-900 for primary text/headings, graphite-500 for
// secondary/muted text, graphite-300 for hairline rules, lilac-500 as
// the single, sparingly-used accent — never a second competing color.
const INK = "#2A1F39"; // graphite-900 — headings, primary text
const INK_MUTED = "#746B82"; // graphite-500 — secondary/meta text
const INK_FAINT = "#B8B2C1"; // graphite-300 — hairline rules
const ACCENT = "#A888B6"; // lilac-500 — the one accent color, used sparingly

// The recurring "signal" mark from the brand's visual language — a
// single point, not a bullet character — set immediately before every
// section label. Purely a typographic/layout device: it carries no
// data-dependent meaning and never varies by what a section contains,
// so it can't be read as flagging or scoring anything.
const SIGNAL_DOT_RADIUS = 2;
const LEFT_MARGIN = 50;
const RIGHT_MARGIN = 545;

function sectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  const y = doc.y;
  doc
    .fillColor(ACCENT)
    .circle(LEFT_MARGIN + SIGNAL_DOT_RADIUS, y + 5, SIGNAL_DOT_RADIUS)
    .fill();
  doc
    .fillColor(INK)
    .fontSize(11)
    .font(EMBR_PDF_HEADING_FONT)
    .text(label.toUpperCase(), LEFT_MARGIN + 10, y, {
      characterSpacing: 0.8,
    });
  doc.moveDown(0.6);
}

/**
 * Renders a previously-generated ClinicalBrief exactly as it was
 * generated — every value here comes from the stored DTO, nothing is
 * recomputed from live symptom/cycle data and nothing calls the AI
 * again. Re-downloading a brief a year later must reproduce the same
 * document, even if the underlying logs have since been edited.
 *
 * Visual language only: every disclaimer, every "not a diagnosis" /
 * "does not assess whether a treatment is working" caveat, and every
 * conditional (which sections render, and when) is unchanged from
 * before this pass — see brief.pdf.test.ts, which asserts on this
 * exact text and passes unmodified against this file.
 */
export function buildClinicalBriefPdf(
  brief: ClinicalBriefDto,
  userEmail: string,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  registerEmbrPdfFonts(doc);

  // ---- Masthead ----
  // "EMBR" as a small, letter-spaced eyebrow above the actual document
  // title — the same relationship the wordmark has to a section label
  // elsewhere in this file — rather than one undifferentiated heading
  // line, so the document reads as an instrument with its own
  // identity, not a generic report with a logo pasted on top.
  doc
    .fillColor(INK_MUTED)
    .fontSize(9)
    .font(EMBR_PDF_HEADING_FONT)
    .text("EMBR", { characterSpacing: 2 });
  doc.moveDown(0.15);
  doc.fillColor(INK).fontSize(22).font(EMBR_PDF_HEADING_FONT).text("Clinical Brief");
  doc.moveDown(0.8);

  doc
    .fillColor(INK_MUTED)
    .fontSize(8)
    .font(EMBR_PDF_HEADING_FONT)
    .text("OBSERVATION PERIOD", { characterSpacing: 0.8 });
  doc.moveDown(0.15);
  doc
    .fillColor(INK)
    .fontSize(12)
    .font(EMBR_PDF_BODY_FONT)
    .text(`${brief.fromDate}  →  ${brief.toDate}`);
  doc.moveDown(0.6);

  doc
    .fontSize(9)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK_MUTED)
    .text(
      `Prepared for ${userEmail}  ·  Generated ${new Date(brief.createdAt)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")} UTC`,
    );
  doc
    .moveDown(0.4)
    .fontSize(9)
    .fillColor(INK_MUTED)
    .text(
      "This is a structured summary of self-tracked data, generated to help a conversation with a" +
        " GP. Not a diagnosis, and not medical advice.",
    );

  doc.moveDown(1);
  doc
    .strokeColor(ACCENT)
    .lineWidth(1)
    .moveTo(LEFT_MARGIN, doc.y)
    .lineTo(RIGHT_MARGIN, doc.y)
    .stroke();
  doc.moveDown(1);

  // ---- AI narrative ----
  sectionHeading(doc, "Summary");
  doc
    .fontSize(10)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK)
    .text(brief.aiNarrative, { align: "left" });
  doc.moveDown(1);

  // ---- Grounded in your data (the deterministic findings the AI actually cited) ----
  // Only rendered when both fields are present and non-empty — see
  // ClinicalBriefDto's own doc comment on citedPatternIds for why an
  // empty array (the AI cited nothing) is a real, distinct fact from
  // null (a brief predating this field). Renders the same
  // observation/association text the web and mobile "Grounded in your
  // data" section does — never re-derived or reworded here.
  if (brief.citedPatternIds && brief.citedPatternIds.length > 0 && brief.interpretation) {
    sectionHeading(doc, "Grounded in your data");
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
  sectionHeading(doc, "Questions to bring to your GP");
  doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
  for (const topic of brief.aiDiscussionTopics) {
    doc.text(`•  ${topic}`, { indent: 0 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.8);

  // ---- Symptom frequency ----
  // Labeled "Symptom Signals" — the same "signal" vocabulary the rest
  // of the product already uses for logged data (see apps/web's
  // copy) — this section's content and computation are unchanged, only
  // the heading text.
  sectionHeading(doc, "Symptom Signals");
  if (brief.symptomSummary.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK_MUTED)
      .text("No symptoms logged in this range.");
  } else {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { category, count, severityBreakdown } of brief.symptomSummary) {
      const bySeverity = Object.entries(severityBreakdown)
        .map(([severity, n]) => `${n} ${severity.toLowerCase()}`)
        .join(", ");
      doc.fillColor(INK).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc
        .fillColor(INK_MUTED)
        .text(`  ${count} occurrence${count === 1 ? "" : "s"} (${bySeverity})`);
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
    sectionHeading(doc, "Compared with the previous period");
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { category, currentCount, previousCount } of brief.frequencyComparison) {
      doc.fillColor(INK).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc
        .fillColor(INK_MUTED)
        .text(
          `  Reported on ${currentCount} day${currentCount === 1 ? "" : "s"}, compared with` +
            ` ${previousCount} day${previousCount === 1 ? "" : "s"} in the previous period.`,
        );
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
  // uses.
  if (brief.persistentSymptoms && brief.persistentSymptoms.length > 0) {
    sectionHeading(doc, "Ongoing symptoms");
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
    for (const category of brief.persistentSymptoms) {
      doc.text(`${categoryLabel(category)} remained present across both periods.`);
    }
    doc.moveDown(1);
  }

  // ---- Patterns noticed (symptom co-occurrence, descriptive only) ----
  // Only rendered when present — coOccurrence is null both for a
  // brief predating this field and for one where no pair reached the
  // existing threshold; see ClinicalBriefDto's own doc comment for
  // why those two cases aren't distinguished here. Descriptive only:
  // "reported on the same day," never "triggers" or "causes" — the
  // same observation-not-causation framing web and mobile use.
  if (brief.coOccurrence) {
    const { categoryA, categoryB, days } = brief.coOccurrence;
    sectionHeading(doc, "Patterns noticed");
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK)
      .text(
        `${categoryLabel(categoryA)} and ${categoryLabel(categoryB)} were both reported on the` +
          ` same day on ${days} occasion${days === 1 ? "" : "s"}.`,
      );
    doc.moveDown(1);
  }

  // ---- Cycle summary ----
  sectionHeading(doc, "Cycle summary");
  const { averageCycleLengthDays, cycleCount, periodDaysLogged } = brief.cycleSummary;
  doc.fontSize(10).font(EMBR_PDF_BODY_FONT).fillColor(INK);
  if (averageCycleLengthDays === null) {
    doc.text("Not enough period-start entries in this range to compute cycle length.");
  } else {
    doc.text(
      `Average cycle length: ${averageCycleLengthDays} days (${cycleCount} cycles recorded)`,
    );
  }
  doc
    .fillColor(INK_MUTED)
    .text(`${periodDaysLogged} period day${periodDaysLogged === 1 ? "" : "s"} logged`);

  doc.moveDown(1);

  // ---- Treatments (deterministic snapshot, no AI involvement) ----
  sectionHeading(doc, "Treatments logged during this period");
  if (brief.treatmentSummary.length === 0) {
    doc
      .fontSize(10)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK_MUTED)
      .text("No treatments logged in this range.");
  } else {
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { name, category, startDate, endDate } of brief.treatmentSummary) {
      const dateRange = `${startDate} – ${endDate ?? "Ongoing"}`;
      doc.fillColor(INK).text(`${name}`, { continued: true, width: 300 });
      doc.fillColor(INK_MUTED).text(`  ${treatmentCategoryLabel(category)}, ${dateRange}`);
    }
  }
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK_MUTED)
    .text(
      "This reflects what you've logged. It does not assess whether a treatment is working or" +
        " make treatment recommendations.",
    );

  // ---- Observed changes after starting treatment (deterministic, no AI involvement) ----
  // Only rendered when non-null and non-empty — unlike coOccurrence,
  // an empty array here is a real fact ("no treatments started this
  // period"), so it's distinguished from null the same way
  // frequencyComparison already is; see ClinicalBriefDto's own doc
  // comment. Observational only: "X logs before, Y after," never
  // "the treatment reduced symptoms" — see treatment-impact.ts's own
  // doc comment on why any efficacy-claim language is explicitly out
  // of scope here.
  if (brief.treatmentImpact && brief.treatmentImpact.length > 0) {
    doc.moveDown(1);
    sectionHeading(doc, "Observed changes after starting treatment");
    doc.fontSize(10).font(EMBR_PDF_BODY_FONT);
    for (const { name, before, after, insufficientData } of brief.treatmentImpact) {
      doc.fillColor(INK).text(name);
      if (insufficientData) {
        doc
          .fillColor(INK_MUTED)
          .text("  Not enough time has passed since starting to compare yet.");
      } else {
        doc
          .fillColor(INK_MUTED)
          .text(
            `  ${before.logCount} symptom log${before.logCount === 1 ? "" : "s"} in the` +
              ` ${before.days} days before starting, compared with ${after.logCount} symptom` +
              ` log${after.logCount === 1 ? "" : "s"} in the ${after.days} days after.`,
          );
      }
    }
    doc.moveDown(0.4);
    doc
      .fontSize(9)
      .font(EMBR_PDF_BODY_FONT)
      .fillColor(INK_MUTED)
      .text(
        "This reflects what you've logged. It does not assess whether a treatment is working or" +
          " make treatment recommendations.",
      );
  }

  // ---- Fine print: what this document is and isn't ----
  // A single, restrained closing line reinforcing the masthead's own
  // disclaimer — the same three-way distinction (reported data vs.
  // observed pattern vs. clinical interpretation) the brand direction
  // asks this document to make clearer, stated once more at the point
  // a reader is most likely to be deciding what to do with the
  // document, not just at the top before they've read it.
  doc.moveDown(1.2);
  doc
    .strokeColor(INK_FAINT)
    .lineWidth(0.5)
    .moveTo(LEFT_MARGIN, doc.y)
    .lineTo(RIGHT_MARGIN, doc.y)
    .stroke();
  doc.moveDown(0.6);
  doc
    .fontSize(8)
    .font(EMBR_PDF_BODY_FONT)
    .fillColor(INK_MUTED)
    .text(
      "Everything above reflects what was reported and, where noted, patterns observed in that" +
        " reported data. None of it is a clinical interpretation or a diagnosis. That judgment" +
        " belongs to the clinician reading this alongside you.",
    );

  return doc;
}
