import type { OnboardingProfile } from "../../generated/prisma/index.js";
import type { OnboardingProfileDto } from "@embr/types";

export function toOnboardingProfileDto(profile: OnboardingProfile | null): OnboardingProfileDto {
  if (!profile) {
    return {
      jobToBeDone: null,
      noticedAreas: [],
      appointmentStatus: null,
      lifeStage: null,
      lastPeriodDate: null,
      currentStep: null,
      skipped: false,
      completedAt: null,
    };
  }

  return {
    jobToBeDone: profile.jobToBeDone,
    noticedAreas: profile.noticedAreas,
    appointmentStatus: profile.appointmentStatus,
    lifeStage: profile.lifeStage,
    lastPeriodDate: profile.lastPeriodDate
      ? profile.lastPeriodDate.toISOString().slice(0, 10)
      : null,
    currentStep: profile.currentStep,
    skipped: profile.skipped,
    completedAt: profile.completedAt ? profile.completedAt.toISOString() : null,
  };
}
