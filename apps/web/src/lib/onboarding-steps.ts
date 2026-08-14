export const ONBOARDING_STEPS = [
  "WELCOME",
  "JOB_TO_BE_DONE",
  "WHATS_GOING_ON",
  "APPOINTMENT_STATUS",
  "THE_LOOP",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_ROUTES: Record<OnboardingStep, string> = {
  WELCOME: "/onboarding/welcome",
  JOB_TO_BE_DONE: "/onboarding/job-to-be-done",
  WHATS_GOING_ON: "/onboarding/whats-going-on",
  APPOINTMENT_STATUS: "/onboarding/appointment-status",
  THE_LOOP: "/onboarding/the-loop",
};

export function isOnboardingStep(value: string | null): value is OnboardingStep {
  return value !== null && (ONBOARDING_STEPS as readonly string[]).includes(value);
}
