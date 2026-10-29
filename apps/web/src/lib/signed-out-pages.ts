/**
 * Pages that work without a session. Several carry a one time token in
 * their address (sign in link, password reset, email verification,
 * organisation invite); sending someone from one of these to the login
 * page loses that token, so a session found expired here is not
 * announced with a redirect.
 */
const SIGNED_OUT_PAGES = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/login-link",
  "/beta",
  "/check-in",
  "/organizations/accept-invite",
]);

export function worksSignedOut(pathname: string): boolean {
  return SIGNED_OUT_PAGES.has(pathname);
}
