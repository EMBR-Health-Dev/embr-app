import { describe, expect, it } from "vitest";
import type { ClinicalBriefDto } from "@embr/types";
import { PDFParse } from "pdf-parse";
import { buildClinicalBriefPdf } from "../src/modules/briefs/brief.pdf.js";

/**
 * Regression coverage for a confirmed, reproduced bug: PDFKit's
 * built-in "Helvetica"/"Helvetica-Bold" fonts (WinAnsiEncoding, Latin-1
 * only) throw no exception on non-Latin-1 text, but silently corrupt
 * it — verified directly, before any fix existed, by rendering a
 * Japanese treatment name through the unmodified renderer and
 * extracting the actual PDF text: it came back as
 * "0¨0¹0È0é0¸0ª0ü0ëŒ¼NØRd", not the original string. EMBR is a
 * bilingual English/Japanese product, and treatment names are
 * free-text user input, so this was a real, reachable path — not a
 * hypothetical one. These tests exercise the real, fixed rendering
 * path end to end (PDFKit → buffer → pdf-parse) rather than only
 * asserting that generation doesn't throw, which the old, broken code
 * also satisfied.
 */

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

async function extractPdfText(doc: PDFKit.PDFDocument): Promise<string> {
  const bufferPromise = collectPdfBuffer(doc);
  doc.end();
  const buffer = await bufferPromise;
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

function baseBrief(overrides: Partial<ClinicalBriefDto> = {}): ClinicalBriefDto {
  return {
    id: "brief-1",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    createdAt: "2026-02-01T12:00:00.000Z",
    symptomSummary: [],
    cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
    treatmentSummary: [],
    frequencyComparison: null,
    coOccurrence: null,
    treatmentImpact: null,
    persistentSymptoms: null,
    interpretation: null,
    citedPatternIds: null,
    aiNarrative: "No significant patterns were noted in this period.",
    aiDiscussionTopics: ["Any new symptoms since the last visit?"],
    ...overrides,
  };
}

describe("buildClinicalBriefPdf — Unicode rendering", () => {
  it("renders a Japanese treatment name correctly, not corrupted", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        {
          name: "エストラジオール貼付剤",
          category: "HRT",
          startDate: "2026-01-01",
          endDate: null,
        },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("エストラジオール貼付剤");
    // The confirmed pre-fix failure mode — guards against a
    // regression back to the exact garbled output that was actually
    // produced, not just "some corruption or other."
    expect(text).not.toContain("0¨0¹0È0é0¸0ª0ü0ëŒ¼NØRd");
  });

  it("renders a mixed Japanese/English treatment name correctly", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        {
          name: "Treatment: エストラジオール",
          category: "HRT",
          startDate: "2026-01-01",
          endDate: null,
        },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Treatment: エストラジオール");
  });

  it("renders Japanese punctuation and full-width characters correctly", async () => {
    const brief = baseBrief({
      aiDiscussionTopics: ["症状の変化はありましたか？（はい・いいえ）"],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("症状の変化はありましたか？（はい・いいえ）");
  });

  it("renders accented Latin characters correctly", async () => {
    const brief = baseBrief({
      treatmentSummary: [
        { name: "Œstrogène — café", category: "HRT", startDate: "2026-01-01", endDate: null },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Œstrogène — café");
  });

  it("still renders ordinary English content correctly with the new font", async () => {
    const brief = baseBrief({
      symptomSummary: [{ category: "HOT_FLASH", count: 3, severityBreakdown: { MODERATE: 3 } }],
      treatmentSummary: [
        { name: "Estradiol patch", category: "HRT", startDate: "2026-01-01", endDate: null },
      ],
    });

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("Estradiol patch");
    expect(text).toContain("Hot Flash");
    expect(text).toContain("No significant patterns were noted in this period.");
  });

  it("generates a minimal, empty-data brief without throwing, with all empty-state text intact", async () => {
    const brief = baseBrief();

    const text = await extractPdfText(buildClinicalBriefPdf(brief, "person@embr.health"));

    expect(text).toContain("No symptoms logged in this range.");
    expect(text).toContain("No treatments logged in this range.");
    expect(text).toContain(
      "Not enough period-start entries in this range to compute cycle length.",
    );
  });
});
