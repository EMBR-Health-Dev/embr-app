import type { AuthSessionResponse, MfaChallengeDto } from "@embr/types";

/**
 * Whether Settings offers to turn two-step sign in on. Off unless
 * NEXT_PUBLIC_MFA_SETUP_ENABLED is "true". Web, admin and mobile all
 * ask for the code at sign in, but a mobile build older than that
 * can't, so this is turned on once testers have the new build (see
 * docs/MFA.md). Settings always lets someone who has it on manage or
 * turn it off.
 */
export const MFA_SETUP_ENABLED = process.env.NEXT_PUBLIC_MFA_SETUP_ENABLED === "true";

/** Sign in answered with "now the code from your app", not a session. */
export function isMfaChallenge(
  result: AuthSessionResponse | MfaChallengeDto,
): result is MfaChallengeDto {
  return "mfaRequired" in result && result.mfaRequired === true;
}
