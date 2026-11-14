/** Every step the API accepts (packages/validation onboardingStepSchema). */
export const ONBOARDING_STEPS = [
  "WELCOME",
  "JOB_TO_BE_DONE",
  "LIFE_STAGE",
  "WHATS_GOING_ON",
  "APPOINTMENT_STATUS",
  "THE_LOOP",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * The screens onboarding shows, same as apps/web: a welcome, then what
 * she has noticed, then straight to her first entry. The older steps
 * stay in the API's enum so stored progress still reads; they all
 * resume at WHATS_GOING_ON.
 */
export const ONBOARDING_FLOW = [
  "WELCOME",
  "WHATS_GOING_ON",
] as const satisfies readonly OnboardingStep[];

// expo-router paths, not Next.js ones — same step keys as
// apps/web/src/lib/onboarding-steps.ts, different route shape.
export const STEP_ROUTES: Record<OnboardingStep, string> = {
  WELCOME: "/onboarding/welcome",
  JOB_TO_BE_DONE: "/onboarding/whats-going-on",
  LIFE_STAGE: "/onboarding/whats-going-on",
  WHATS_GOING_ON: "/onboarding/whats-going-on",
  APPOINTMENT_STATUS: "/onboarding/whats-going-on",
  THE_LOOP: "/onboarding/whats-going-on",
};

export function isOnboardingStep(value: string | null): value is OnboardingStep {
  return value !== null && (ONBOARDING_STEPS as readonly string[]).includes(value);
}
