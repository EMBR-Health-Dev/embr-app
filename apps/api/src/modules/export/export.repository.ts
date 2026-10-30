import type { ExportQuery } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { calendarDateBounds } from "../../lib/local-day-label.js";
import { consentRepository } from "../consent/consent.repository.js";

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
    const days = calendarDateBounds(query);
    return prisma.cycleEntry.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              date: {
                ...(days.from ? { gte: days.from } : {}),
                ...(days.to ? { lte: days.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },

  /** Notes by when they were written, so a date range exports the notes
   * started in it. */
  listNotesForExport(userId: string, query: ExportQuery) {
    return prisma.note.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: query.from } : {}),
                ...(query.to ? { lte: query.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },

  listContextLogsForExport(userId: string, query: ExportQuery) {
    const days = calendarDateBounds(query);
    return prisma.contextLog.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              date: {
                ...(days.from ? { gte: days.from } : {}),
                ...(days.to ? { lte: days.to } : {}),
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
    const days = calendarDateBounds(query);
    return prisma.treatment.findMany({
      where: {
        userId,
        ...(days.to ? { startDate: { lte: days.to } } : {}),
        ...(days.from ? { OR: [{ endDate: null }, { endDate: { gte: days.from } }] } : {}),
      },
      orderBy: { startDate: "asc" },
      take: EXPORT_ROW_CAP,
    });
  },

  /**
   * Everything stored about one person, for the "all my data" download.
   * No date range and no row cap: this is the copy of her whole record
   * she is entitled to, so silently truncating it would be wrong. Even
   * a heavy three year record is a few thousand small rows.
   *
   * Left out on purpose: the password hash, sessions and one time
   * tokens (security secrets, not her record), and the audit log
   * (security records about the account; see docs/planning/counsel-brief.md).
   */
  async loadAllForUser(userId: string) {
    const byUser = { where: { userId }, omit: { userId: true } } as const;
    const [
      account,
      onboarding,
      consentHistory,
      symptomLogs,
      cycleEntries,
      contextLogs,
      treatments,
      notes,
      mrsCheckIns,
      baselineCheckIn,
      briefs,
      reflectionDismissals,
      memberships,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, emailVerifiedAt: true, createdAt: true },
      }),
      prisma.onboardingProfile.findUnique({ where: { userId }, omit: { userId: true } }),
      consentRepository.history(userId),
      prisma.symptomLog.findMany({ ...byUser, orderBy: { occurredAt: "asc" } }),
      prisma.cycleEntry.findMany({ ...byUser, orderBy: { date: "asc" } }),
      prisma.contextLog.findMany({ ...byUser, orderBy: { date: "asc" } }),
      prisma.treatment.findMany({ ...byUser, orderBy: { startDate: "asc" } }),
      prisma.note.findMany({ ...byUser, orderBy: { createdAt: "asc" } }),
      prisma.mrsCheckIn.findMany({ ...byUser, orderBy: { completedOn: "asc" } }),
      prisma.baselineCheckIn.findUnique({
        where: { userId },
        omit: { userId: true },
        include: { symptoms: { omit: { baselineCheckInId: true }, orderBy: { category: "asc" } } },
      }),
      prisma.clinicalBrief.findMany({ ...byUser, orderBy: { createdAt: "asc" } }),
      prisma.reflectionDismissal.findMany({ ...byUser, orderBy: { dismissedAt: "asc" } }),
      prisma.organizationMembership.findMany({
        where: { userId },
        select: { role: true, createdAt: true, organization: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      account,
      onboarding,
      consentHistory,
      symptomLogs,
      cycleEntries,
      contextLogs,
      treatments,
      notes,
      mrsCheckIns,
      baselineCheckIn,
      briefs,
      reflectionDismissals,
      memberships,
    };
  },
};
