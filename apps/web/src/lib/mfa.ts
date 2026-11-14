import type { AuthSessionResponse, MfaChallengeDto } from "@embr/types";

/**
 * Whether Settings offers to turn two-step sign in on. Off unless
 * NEXT_PUBLIC_MFA_SETUP_ENABLED is "true": the mobile and admin apps
 * can't ask for the code yet, so someone who turned it on here would be
 * locked out of them. The web sign in pages handle the code step
 * either way, and Settings always lets someone who has it on manage or
 * turn it off.
 */
export const MFA_SETUP_ENABLED = process.env.NEXT_PUBLIC_MFA_SETUP_ENABLED === "true";

/** Sign in answered with "now the code from your app", not a session. */
export function isMfaChallenge(
  result: AuthSessionResponse | MfaChallengeDto,
): result is MfaChallengeDto {
  return "mfaRequired" in result && result.mfaRequired === true;
}
