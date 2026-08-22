/**
 * Pulls a password-reset token out of whatever the person pasted.
 *
 * Unlike apps/web, which reads the token straight from the URL the
 * email link opens, there's no deep-linking set up for this flow on
 * mobile — the email link always points at a web page (see
 * mailer.ts's sendPasswordResetEmail). The person has to bring the
 * token to the app screen themselves, most naturally by copying the
 * whole link out of their email app and pasting it here, so this
 * accepts either the bare token or a full
 * .../reset-password?token=... URL and pulls the token out of
 * whichever one it got.
 */
export function extractToken(pasted: string): string {
  const trimmed = pasted.trim();
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("token");
    if (fromQuery) return fromQuery;
  } catch {
    // Not a URL — the pasted value is the token itself.
  }
  return trimmed;
}
