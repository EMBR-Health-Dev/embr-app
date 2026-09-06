import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { buildClinicianSummaryPdf } from "../src/modules/export/pdf.js";
import type { CycleEntry, SymptomLog, Treatment } from "../src/generated/prisma/index.js";

/**
 * Same confirmed bug and fix as brief.pdf.test.ts, exercised against
 * this file's own renderer — see that file's own doc comment for the
 * full reproduction. This renderer has an even broader exposure than
 * the clinical brief: it renders symptomLog.notes and treatment.notes
 * directly, both fully free-text, in addition to treatment.name — and
 * this is the "clinician summary" export, the document most directly
 * intended to be read by a GP.
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

function symptomLog(overrides: Partial<SymptomLog> = {}): SymptomLog {
  return {
    id: "log-1",
    userId: "user-1",
    category: "HOT_FLASH",
    severity: "MODERATE",
    occurredAt: new Date("2026-01-15T08:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-15T08:00:00.000Z"),
    updatedAt: new Date("2026-01-15T08:00:00.000Z"),
    ...overrides,
  };
}

function treatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: "treatment-1",
    userId: "user-1",
    name: "Estradiol patch",
    category: "HRT",
    startDate: new Date("2026-01-01"),
    endDate: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const NO_CYCLE_ENTRIES: CycleEntry[] = [];

describe("buildClinicianSummaryPdf — Unicode rendering", () => {
  it("renders a Japanese treatment name correctly, not corrupted", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [treatment({ name: "エストラジオール貼付剤" })],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("エストラジオール貼付剤");
    expect(text).not.toContain("0¨0¹0È0é0¸0ª0ü0ëŒ¼NØRd");
  });

  it("renders Japanese free-text symptom log notes correctly", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [symptomLog({ notes: "夜中に目が覚めて、汗をかいていた。" })],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("夜中に目が覚めて、汗をかいていた。");
  });

  it("renders Japanese free-text treatment notes correctly", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [treatment({ notes: "医師の指示により1日1回貼付。" })],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("医師の指示により1日1回貼付。");
  });

  it("renders a mixed Japanese/English treatment name correctly", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [treatment({ name: "Treatment: エストラジオール" })],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("Treatment: エストラジオール");
  });

  it("renders accented Latin characters correctly", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [symptomLog({ notes: "Œstrogène — café, sans problème" })],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("Œstrogène — café, sans problème");
  });

  it("still renders ordinary English content correctly with the new font", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [symptomLog({ notes: "Mild, resolved within an hour." })],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [treatment()],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("Estradiol patch");
    expect(text).toContain("Mild, resolved within an hour.");
    expect(text).toContain("Hot Flash");
  });

  it("generates a minimal, empty-data summary without throwing, with all empty-state text intact", async () => {
    const doc = buildClinicianSummaryPdf({
      userEmail: "person@embr.health",
      symptomLogs: [],
      cycleEntries: NO_CYCLE_ENTRIES,
      treatments: [],
    });

    const text = await extractPdfText(doc);

    expect(text).toContain("No entries in this range.");
    expect(text).toContain("No treatments logged in this range.");
  });
});
