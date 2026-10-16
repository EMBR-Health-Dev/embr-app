/**
 * Whether new accounts can be created from this build. Off unless
 * EXPO_PUBLIC_REGISTRATION_OPEN is "true". Accounts are created on the
 * web for now; the API's own rule (PUBLIC_REGISTRATION_ENABLED) still
 * applies either way, and this only decides what the screen shows.
 */
export function isRegistrationOpen(): boolean {
  return process.env.EXPO_PUBLIC_REGISTRATION_OPEN === "true";
}

/**
 * Where people create an account while this build cannot: the web app,
 * which has the full sign up. EXPO_PUBLIC_WEB_URL overrides the
 * production address for other environments.
 */
export const WEB_SIGN_UP_HREF = `${process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.embrhealthcare.com"}/register`;
