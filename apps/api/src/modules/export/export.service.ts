import type { ExportQuery } from "@embr/validation";
import { exportRepository } from "./export.repository.js";
import { toCsv } from "./csv.js";
import { buildClinicianSummaryPdf } from "./pdf.js";

interface SymptomLogRecord {
  occurredAt: Date;
  category: string;
  severity: string;
  notes: string | null;
}

interface CycleEntryRecord {
  date: Date;
  flow: string | null;
  isPeriodStart: boolean;
  isPeriodEnd: boolean;
  notes: string | null;
}

interface TreatmentRecord {
  name: string;
  category: string;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
}

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** categoryLabel (above) does a generic underscore-to-title-case
 * transform, which is correct for symptom/cycle-flow categories but
 * would render "HRT" as "Hrt" — a real acronym, not a word to
 * title-case. Small and local to this file rather than changing the
 * shared helper, matching the exact same reasoning (and the exact
 * same fix) brief.pdf.ts already applies for its own treatment
 * category rendering. */
function treatmentCategoryLabel(category: string): string {
  if (category === "HRT") return "HRT";
  return categoryLabel(category);
}

export const exportService = {
  async symptomLogsCsv(userId: string, query: ExportQuery): Promise<string> {
    const logs = await exportRepository.listSymptomLogsForExport(userId, query);
    return toCsv(
      ["date", "category", "severity", "notes"],
      logs.map((log: SymptomLogRecord) => [
        log.occurredAt.toISOString(),
        categoryLabel(log.category),
        log.severity,
        log.notes,
      ]),
    );
  },

  async cycleEntriesCsv(userId: string, query: ExportQuery): Promise<string> {
    const entries = await exportRepository.listCycleEntriesForExport(userId, query);
    return toCsv(
      ["date", "flow", "periodStart", "periodEnd", "notes"],
      entries.map((entry: CycleEntryRecord) => [
        entry.date.toISOString().slice(0, 10),
        entry.flow ? categoryLabel(entry.flow) : "",
        entry.isPeriodStart,
        entry.isPeriodEnd,
        entry.notes,
      ]),
    );
  },

  async treatmentsCsv(userId: string, query: ExportQuery): Promise<string> {
    const treatments = await exportRepository.listTreatmentsForExport(userId, query);
    return toCsv(
      ["name", "category", "startDate", "endDate", "notes"],
      treatments.map((treatment: TreatmentRecord) => [
        treatment.name,
        treatmentCategoryLabel(treatment.category),
        treatment.startDate.toISOString().slice(0, 10),
        treatment.endDate ? treatment.endDate.toISOString().slice(0, 10) : "",
        treatment.notes,
      ]),
    );
  },

  async clinicianSummaryPdf(userId: string, userEmail: string, query: ExportQuery) {
    const [symptomLogs, cycleEntries, treatments] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
      exportRepository.listTreatmentsForExport(userId, query),
    ]);
    return buildClinicianSummaryPdf({
      userEmail,
      from: query.from,
      to: query.to,
      symptomLogs,
      cycleEntries,
      treatments,
    });
  },
};
