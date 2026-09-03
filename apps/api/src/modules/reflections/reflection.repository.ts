import type { ReflectionType, TreatmentCategory } from "@embr/types";
import { prisma } from "../../lib/prisma.js";

/** Same reasoning as trendsRepository's SYMPTOM_LOG_ROW_CAP — a
 * generous safety ceiling for a set of computations that has to happen
 * in application code, not a real pagination story. Reflections are
 * computed over a short (default 7-day) trailing window, so this cap
 * is never expected to bind in practice. */
const SYMPTOM_LOG_ROW_CAP = 5000;

export interface TreatmentOverlappingPeriod {
  id: string;
  name: string;
  category: TreatmentCategory;
  startDate: Date;
  endDate: Date | null;
}

export const reflectionRepository = {
  /** One query, reused by every Stage 3 detector in reflection.service.ts
   * (logging activity, top frequency, co-occurrence) — all three read
   * the same underlying rows, so there's no reason to hit the database
   * three times for one home-screen load. */
  symptomLogsForPeriod(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ category: string; severity: string; occurredAt: Date }>> {
    return prisma.symptomLog.findMany({
      where: { userId, occurredAt: { gte: from, lte: to } },
      select: { category: true, severity: true, occurredAt: true },
      take: SYMPTOM_LOG_ROW_CAP,
    });
  },

  /** Delegates to treatmentRepository's own listOverlappingRange query
   * would create a cross-module import cycle risk for no benefit — this
   * is the same query shape (see treatment.repository.ts's doc
   * comment), kept local since reflections' use of it (matching against
   * symptom logs for a factual count) is unrelated to BRIEF's use of it
   * (a point-in-time snapshot).
   *
   * Return type is spelled out explicitly, the same as
   * symptomLogsForPeriod above — deliberately not left to infer from
   * Prisma's generated Treatment model, so this file's own type-safety
   * never depends on the generated client having been built yet (e.g.
   * a fresh clone before the first `prisma generate`). */
  treatmentsOverlappingPeriod(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<TreatmentOverlappingPeriod[]> {
    return prisma.treatment.findMany({
      where: {
        userId,
        startDate: { lte: to },
        OR: [{ endDate: null }, { endDate: { gte: from } }],
      },
      select: { id: true, name: true, category: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
    });
  },

  dismissedKeys(userId: string, type: ReflectionType, keys: string[]): Promise<string[]> {
    if (keys.length === 0) return Promise.resolve([]);
    return prisma.reflectionDismissal
      .findMany({
        where: { userId, type, dismissalKey: { in: keys } },
        select: { dismissalKey: true },
      })
      .then((rows: Array<{ dismissalKey: string }>) => rows.map((r) => r.dismissalKey));
  },

  /** Upsert, not create — dismissing an already-dismissed key (e.g. a
   * duplicate tap before the client updates its own state) must not
   * error, matching cycleEntries' upsert-by-natural-key convention.
   * The unique constraint is (userId, type, dismissalKey). */
  async dismiss(userId: string, type: ReflectionType, key: string): Promise<void> {
    await prisma.reflectionDismissal.upsert({
      where: { userId_type_dismissalKey: { userId, type, dismissalKey: key } },
      create: { userId, type, dismissalKey: key },
      update: {},
    });
  },
};
