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

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  async clinicianSummaryPdf(userId: string, userEmail: string, query: ExportQuery) {
    const [symptomLogs, cycleEntries] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
    ]);
    return buildClinicianSummaryPdf({
      userEmail,
      from: query.from,
      to: query.to,
      symptomLogs,
      cycleEntries,
    });
  },
};
