import type { SaveBaselineCheckInInput } from "@embr/validation";
import { BASELINE_RECALL_DAYS } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";

const withSymptoms = { symptoms: { orderBy: { category: "asc" } } } as const;

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Every query is scoped to userId (same rule as note.repository.ts). */
export const baselineRepository = {
  findForUser(userId: string) {
    return prisma.baselineCheckIn.findUnique({ where: { userId }, include: withSymptoms });
  },

  /**
   * Creates her baseline, or returns the one she already has, unchanged.
   * The unique index on userId is the real guard: of two saves at the
   * same moment, the second insert fails and reads back the first.
   */
  async createOnce(
    userId: string,
    input: SaveBaselineCheckInInput,
    consent: { version: string; grantedAt: Date },
  ) {
    const existing = await this.findForUser(userId);
    if (existing) return { baseline: existing, created: false };
    try {
      const baseline = await prisma.baselineCheckIn.create({
        data: {
          userId,
          completedOn: new Date(`${input.completedOn}T00:00:00.000Z`),
          timeZone: input.timeZone,
          recallDays: BASELINE_RECALL_DAYS,
          locale: input.locale,
          goal: input.goal,
          sleepDuration: input.sleepDuration,
          workImpact: input.workImpact,
          symptomsAnswered: input.symptomsAnswered,
          healthConsentVersion: consent.version,
          healthConsentAt: consent.grantedAt,
          symptoms: { create: input.symptoms },
        },
        include: withSymptoms,
      });
      return { baseline, created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.findForUser(userId);
      if (!winner) throw err;
      return { baseline: winner, created: false };
    }
  },
};
