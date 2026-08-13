import { prisma } from "../../lib/prisma.js";

export interface OnboardingUpsertData {
  currentStep?: string;
  jobToBeDone?: string;
  noticedAreas?: string[];
  appointmentStatus?: string;
  completedAt?: Date;
  skipped?: boolean;
}

export const onboardingRepository = {
  /** Scoped to userId directly — there is no separate onboarding
   * profile ID anywhere in the API surface (no :id route param on
   * either GET or PATCH /onboarding), so there's no ID for a caller to
   * ever supply, correctly or otherwise. Authorization here is just
   * "which user is asking," nothing to check against a resource ID. */
  findByUserId(userId: string) {
    return prisma.onboardingProfile.findUnique({ where: { userId } });
  },

  /** A genuine partial update — `data`'s keys are exactly what the
   * caller provided (see onboarding.service.ts), and Prisma's `update`
   * only touches keys actually present in the object, leaving
   * previously-set fields alone. `create` reuses the same partial data
   * plus the schema's own defaults (skipped: false, noticedAreas: [])
   * for whatever wasn't provided on a first-ever PATCH. */
  upsert(userId: string, data: OnboardingUpsertData) {
    return prisma.onboardingProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data },
    });
  },
};
