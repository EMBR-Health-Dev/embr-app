import {
  LifeStage,
  OnboardingArea,
  OnboardingAppointmentStatus,
  OnboardingJobToBeDone,
  OnboardingStep,
} from "../../generated/prisma/index.js";

import { prisma } from "../../lib/prisma.js";

export interface OnboardingUpsertData {
  currentStep?: string;
  jobToBeDone?: string;
  noticedAreas?: string[];
  appointmentStatus?: string;
  lifeStage?: string | null;
  completedAt?: Date;
  skipped?: boolean;
}

export const onboardingRepository = {
  findByUserId(userId: string) {
    return prisma.onboardingProfile.findUnique({
      where: { userId },
    });
  },

  upsert(userId: string, data: OnboardingUpsertData) {
    return prisma.onboardingProfile.upsert({
      where: { userId },

      create: {
        userId,

        ...(data.currentStep !== undefined && {
          currentStep: data.currentStep as OnboardingStep,
        }),

        ...(data.jobToBeDone !== undefined && {
          jobToBeDone: data.jobToBeDone as OnboardingJobToBeDone,
        }),

        ...(data.noticedAreas !== undefined && {
          noticedAreas: data.noticedAreas as OnboardingArea[],
        }),

        ...(data.appointmentStatus !== undefined && {
          appointmentStatus: data.appointmentStatus as OnboardingAppointmentStatus,
        }),

        ...(data.lifeStage !== undefined && {
          lifeStage: data.lifeStage as LifeStage | null,
        }),

        ...(data.completedAt !== undefined && {
          completedAt: data.completedAt,
        }),

        ...(data.skipped !== undefined && {
          skipped: data.skipped,
        }),
      },

      update: {
        ...(data.currentStep !== undefined && {
          currentStep: data.currentStep as OnboardingStep,
        }),

        ...(data.jobToBeDone !== undefined && {
          jobToBeDone: data.jobToBeDone as OnboardingJobToBeDone,
        }),

        ...(data.noticedAreas !== undefined && {
          noticedAreas: {
            set: data.noticedAreas as OnboardingArea[],
          },
        }),

        ...(data.appointmentStatus !== undefined && {
          appointmentStatus: data.appointmentStatus as OnboardingAppointmentStatus,
        }),

        ...(data.lifeStage !== undefined && {
          lifeStage: data.lifeStage as LifeStage | null,
        }),

        ...(data.completedAt !== undefined && {
          completedAt: data.completedAt,
        }),

        ...(data.skipped !== undefined && {
          skipped: data.skipped,
        }),
      },
    });
  },
};
