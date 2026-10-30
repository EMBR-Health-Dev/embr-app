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

interface ContextLogRecord {
  date: Date;
  sleepDuration: string | null;
  caffeineAfternoon: boolean | null;
  alcohol: boolean | null;
  stressLevel: string | null;
  nightSweats: string | null;
  workImpact: string | null;
  exercise: string | null;
  socialImpact: string | null;
}

interface TreatmentRecord {
  name: string;
  category: string;
  startDate: Date;
  endDate: Date | null;
  stopReason: string | null;
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

/** Version of the all-data file's layout, so a reader can tell what to expect. */
export const ALL_DATA_EXPORT_VERSION = 1;

/** Drops the owner id from rows that carry it. The repository already
 * omits it; this keeps the file clean whatever the query returns. */
function withoutUserId<T extends object>(rows: T[]): Array<Omit<T, "userId">> {
  return rows.map(
    (row) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== "userId")) as Omit<
        T,
        "userId"
      >,
  );
}

export const exportService = {
  /**
   * Her whole record as one JSON file: account, onboarding answers,
   * consent history and every entry, note and BRIEF. The CSVs and PDF
   * are for reading and for appointments; this is the complete copy.
   */
  async allDataJson(userId: string) {
    const data = await exportRepository.loadAllForUser(userId);
    const account = data.account && {
      id: data.account.id,
      email: data.account.email,
      role: data.account.role,
      emailVerifiedAt: data.account.emailVerifiedAt,
      createdAt: data.account.createdAt,
    };
    return {
      format: "embr-all-data",
      version: ALL_DATA_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      account,
      onboarding: data.onboarding ? withoutUserId([data.onboarding])[0] : null,
      consentHistory: withoutUserId([...data.consentHistory].reverse()),
      symptomLogs: withoutUserId(data.symptomLogs),
      cycleEntries: withoutUserId(data.cycleEntries),
      dailyContext: withoutUserId(data.contextLogs),
      treatments: withoutUserId(data.treatments),
      notes: withoutUserId(data.notes),
      menopauseRatingScale: withoutUserId(data.mrsCheckIns),
      briefs: withoutUserId(data.briefs),
      dismissedReflections: withoutUserId(data.reflectionDismissals),
      organizations: data.memberships.map((m) => ({
        organizationName: m.organization.name,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    };
  },

  async symptomLogsCsv(userId: string, query: ExportQuery): Promise<string> {
    const logs = await exportRepository.listSymptomLogsForExport(userId, query);
    return toCsv(
      ["occurredAt (UTC)", "category", "severity", "notes"],
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

  /** A blank cell means "not logged", never "no" — the same rule the
   * app applies everywhere a context factor was left empty. */
  async contextLogsCsv(userId: string, query: ExportQuery): Promise<string> {
    const logs = await exportRepository.listContextLogsForExport(userId, query);
    return toCsv(
      [
        "date",
        "sleepDuration",
        "caffeineAfternoon",
        "alcohol",
        "stressLevel",
        "nightSweatsRecalled",
        "workImpact",
        "exercise",
        "socialImpact",
      ],
      logs.map((log: ContextLogRecord) => [
        log.date.toISOString().slice(0, 10),
        log.sleepDuration,
        log.caffeineAfternoon,
        log.alcohol,
        log.stressLevel,
        log.nightSweats,
        log.workImpact,
        log.exercise,
        log.socialImpact,
      ]),
    );
  },

  async notesCsv(userId: string, query: ExportQuery): Promise<string> {
    const notes = await exportRepository.listNotesForExport(userId, query);
    return toCsv(
      ["createdAt", "updatedAt", "title", "body"],
      notes.map((note: { createdAt: Date; updatedAt: Date; title: string; body: string }) => [
        note.createdAt.toISOString(),
        note.updatedAt.toISOString(),
        note.title,
        note.body,
      ]),
    );
  },

  async treatmentsCsv(userId: string, query: ExportQuery): Promise<string> {
    const treatments = await exportRepository.listTreatmentsForExport(userId, query);
    return toCsv(
      ["name", "category", "startDate", "endDate", "stopReason", "notes"],
      treatments.map((treatment: TreatmentRecord) => [
        treatment.name,
        treatmentCategoryLabel(treatment.category),
        treatment.startDate.toISOString().slice(0, 10),
        treatment.endDate ? treatment.endDate.toISOString().slice(0, 10) : "",
        // Her own record, so every stored value is exported, including
        // PREFER_NOT_TO_SAY (which the BRIEF does not print).
        treatment.stopReason,
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
      timeZone: query.timeZone,
      symptomLogs,
      cycleEntries,
      treatments,
    });
  },
};
