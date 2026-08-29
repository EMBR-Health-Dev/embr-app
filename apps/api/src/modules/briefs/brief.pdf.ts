import PDFDocument from "pdfkit";
import type { ClinicalBriefDto } from "@embr/types";
import { categoryLabel } from "../export/pdf.js";

/** categoryLabel (above) does a generic underscore-to-title-case
 * transform, which is correct for symptom categories but would render
 * "HRT" as "Hrt" — a real acronym, not a word to title-case. Small and
 * local to this file rather than changing the shared helper, which is
 * also used for symptom categories and out of scope here. */
function treatmentCategoryLabel(category: string): string {
  if (category === "HRT") return "HRT";
  return categoryLabel(category);
}

/**
 * Renders a previously-generated ClinicalBrief exactly as it was
 * generated — every value here comes from the stored DTO, nothing is
 * recomputed from live symptom/cycle data and nothing calls the AI
 * again. Re-downloading a brief a year later must reproduce the same
 * document, even if the underlying logs have since been edited.
 */
export function buildClinicalBriefPdf(
  brief: ClinicalBriefDto,
  userEmail: string,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  const brass = "#b8974f";
  const navy = "#0f1b2d";

  doc.fillColor(navy).fontSize(20).font("Helvetica-Bold").text("EMBR BRIEF");
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#555555")
    .text(`Prepared for ${userEmail}`)
    .text(`Range: ${brief.fromDate} to ${brief.toDate}`)
    .text(
      `Generated ${new Date(brief.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC`,
    );
  doc
    .moveDown(0.5)
    .fontSize(9)
    .fillColor("#888888")
    .text(
      "This is a structured summary of self-tracked data, generated to help a conversation with a" +
        " GP — not a diagnosis, and not medical advice.",
    );

  doc.moveDown(1.2);
  doc.strokeColor(brass).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  // ---- AI narrative ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Summary");
  doc.moveDown(0.4);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#333333")
    .text(brief.aiNarrative, { align: "left" });
  doc.moveDown(1);

  // ---- Discussion topics ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Questions to bring to your GP");
  doc.moveDown(0.4);
  doc.fontSize(10).font("Helvetica").fillColor("#333333");
  for (const topic of brief.aiDiscussionTopics) {
    doc.text(`•  ${topic}`, { indent: 0 });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.8);

  // ---- Symptom frequency ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Symptom frequency");
  doc.moveDown(0.4);
  if (brief.symptomSummary.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text("No symptoms logged in this range.");
  } else {
    doc.fontSize(10).font("Helvetica");
    for (const { category, count, severityBreakdown } of brief.symptomSummary) {
      const bySeverity = Object.entries(severityBreakdown)
        .map(([severity, n]) => `${n} ${severity.toLowerCase()}`)
        .join(", ");
      doc.fillColor(navy).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc
        .fillColor("#555555")
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
    doc
      .fillColor(navy)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Compared with the previous period");
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica");
    for (const { category, currentCount, previousCount } of brief.frequencyComparison) {
      doc.fillColor(navy).text(`${categoryLabel(category)}`, { continued: true, width: 300 });
      doc
        .fillColor("#555555")
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
    doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Ongoing symptoms");
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica").fillColor("#333333");
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
    doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Patterns noticed");
    doc.moveDown(0.4);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#333333")
      .text(
        `${categoryLabel(categoryA)} and ${categoryLabel(categoryB)} were both reported on the` +
          ` same day on ${days} occasion${days === 1 ? "" : "s"}.`,
      );
    doc.moveDown(1);
  }

  // ---- Cycle summary ----
  doc.fillColor(navy).fontSize(14).font("Helvetica-Bold").text("Cycle summary");
  doc.moveDown(0.4);
  const { averageCycleLengthDays, cycleCount, periodDaysLogged } = brief.cycleSummary;
  doc.fontSize(10).font("Helvetica").fillColor(navy);
  if (averageCycleLengthDays === null) {
    doc.text("Not enough period-start entries in this range to compute cycle length.");
  } else {
    doc.text(
      `Average cycle length: ${averageCycleLengthDays} days (${cycleCount} cycles recorded)`,
    );
  }
  doc
    .fillColor("#555555")
    .text(`${periodDaysLogged} period day${periodDaysLogged === 1 ? "" : "s"} logged`);

  doc.moveDown(1);

  // ---- Treatments (deterministic snapshot, no AI involvement) ----
  doc
    .fillColor(navy)
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Treatments logged during this period");
  doc.moveDown(0.4);
  if (brief.treatmentSummary.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#555555")
      .text("No treatments logged in this range.");
  } else {
    doc.fontSize(10).font("Helvetica");
    for (const { name, category, startDate, endDate } of brief.treatmentSummary) {
      const dateRange = `${startDate} – ${endDate ?? "Ongoing"}`;
      doc.fillColor(navy).text(`${name}`, { continued: true, width: 300 });
      doc.fillColor("#555555").text(`  ${treatmentCategoryLabel(category)}, ${dateRange}`);
    }
  }
  doc.moveDown(0.4);
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#888888")
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
    doc
      .fillColor(navy)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Observed changes after starting treatment");
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica");
    for (const { name, before, after, insufficientData } of brief.treatmentImpact) {
      doc.fillColor(navy).text(name);
      if (insufficientData) {
        doc
          .fillColor("#555555")
          .text("  Not enough time has passed since starting to compare yet.");
      } else {
        doc
          .fillColor("#555555")
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
      .font("Helvetica")
      .fillColor("#888888")
      .text(
        "This reflects what you've logged. It does not assess whether a treatment is working or" +
          " make treatment recommendations.",
      );
  }

  return doc;
}
