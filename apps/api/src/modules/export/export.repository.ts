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
};
