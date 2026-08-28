/**
 * The step sequence and its type/guard were identical between
 * apps/web/src/lib/onboarding-steps.ts and apps/mobile/lib/onboarding-steps.ts
 * (a mobile-side comment even documented "same step keys ... different
 * route shape" while shipping the exact same keys). `STEP_ROUTES`
 * itself deliberately stays local to each app — Next.js and
 * expo-router paths are a genuine platform difference even though
 * they happen to read identically today — but the steps themselves
 * are a single, non-platform-specific vocabulary.
 */
export const ONBOARDING_STEPS = [
  "WELCOME",
  "JOB_TO_BE_DONE",
  "WHATS_GOING_ON",
  "APPOINTMENT_STATUS",
  "THE_LOOP",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string | null): value is OnboardingStep {
  return value !== null && (ONBOARDING_STEPS as readonly string[]).includes(value);
}
