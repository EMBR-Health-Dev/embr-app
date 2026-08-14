import type { OnboardingProfileDto } from "@embr/types";
import type { PatchOnboardingInput } from "@embr/validation";
import { onboardingRepository, type OnboardingUpsertData } from "./onboarding.repository.js";
import { toOnboardingProfileDto } from "./onboarding.mappers.js";

export const onboardingService = {
  async get(userId: string): Promise<OnboardingProfileDto> {
    const profile = await onboardingRepository.findByUserId(userId);
    return toOnboardingProfileDto(profile);
  },

  async patch(userId: string, input: PatchOnboardingInput): Promise<OnboardingProfileDto> {
    const { status, ...answers } = input;
    const data: OnboardingUpsertData = { ...answers };

    // A skip and a full completion both end onboarding the same way —
    // completedAt gets set either way, so onboarding never shows again
    // regardless of which happened — but `skipped` is what lets that
    // distinction survive for anything that looks at it later.
    if (status === "completed") {
      data.completedAt = new Date();
    } else if (status === "skipped") {
      data.completedAt = new Date();
      data.skipped = true;
    }

    const profile = await onboardingRepository.upsert(userId, data);
    return toOnboardingProfileDto(profile);
  },
};
