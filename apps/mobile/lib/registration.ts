/**
 * Whether new accounts can be created from this build. Off unless
 * EXPO_PUBLIC_REGISTRATION_OPEN is "true": EMBR is in private early
 * access until the company is incorporated and the Privacy Policy and
 * Terms are final. The API enforces the same rule
 * (PUBLIC_REGISTRATION_ENABLED); this only decides what the screen shows.
 */
export function isRegistrationOpen(): boolean {
  return process.env.EXPO_PUBLIC_REGISTRATION_OPEN === "true";
}

export const EARLY_ACCESS_HREF = "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access";
