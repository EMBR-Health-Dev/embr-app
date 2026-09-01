import type { ExportQuery } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";

/**
 * An export is "give me everything in this range," not a page of it —
 * but "everything" still needs a ceiling so a pathological range (or a
 * client mistake) can't pull an unbounded result set into memory to
 * build a CSV/PDF from. 5000 rows is generously above anything a real
 * person logs in a clinically-relevant window; if that ever becomes a
 * real constraint, the fix is a genuine streaming export, not a bigger
 * number here.
 */
const EXPORT_ROW_CAP = 5000;

export const exportRepository = {
  listSymptomLogsForExport(userId: string, query: ExportQuery) {
    return prisma.symptomLog.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              occurredAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },

  listCycleEntriesForExport(userId: string, query: ExportQuery) {
    return prisma.cycleEntry.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },

  /** Overlap semantics, not "startDate within range" — a treatment that
   * started before `from` but is still ongoing (or ended) inside the
   * requested window genuinely was active during it and must still
   * appear. Same reasoning as treatment.repository.ts's
   * listOverlappingRange, but reimplemented here rather than called
   * directly: that function requires both fromDate and toDate, while
   * ExportQuery's from/to are each independently optional (matching
   * this file's own listSymptomLogsForExport/listCycleEntriesForExport
   * above, and the export page's own "leave dates blank to export
   * everything" UX) — an unbounded side of the range means that half
   * of the overlap check is simply omitted, not synthesized from a
   * sentinel date. */
  listTreatmentsForExport(userId: string, query: ExportQuery) {
    return prisma.treatment.findMany({
      where: {
        userId,
        ...(query.to ? { startDate: { lte: query.to } } : {}),
        ...(query.from ? { OR: [{ endDate: null }, { endDate: { gte: query.from } }] } : {}),
      },
      orderBy: { startDate: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },
};
