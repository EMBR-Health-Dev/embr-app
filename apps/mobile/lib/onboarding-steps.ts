import type { OnboardingStep } from "@embr/onboarding";

export { ONBOARDING_STEPS, isOnboardingStep, type OnboardingStep } from "@embr/onboarding";

// expo-router paths, not Next.js ones — same step keys as
// apps/web/src/lib/onboarding-steps.ts, different route shape.
export const STEP_ROUTES: Record<OnboardingStep, string> = {
  WELCOME: "/onboarding/welcome",
  JOB_TO_BE_DONE: "/onboarding/job-to-be-done",
  WHATS_GOING_ON: "/onboarding/whats-going-on",
  APPOINTMENT_STATUS: "/onboarding/appointment-status",
  THE_LOOP: "/onboarding/the-loop",
};
