/**
 * Only ever returns a same-origin relative path, or null. `redirect`
 * query params are attacker-controlled input (anyone can craft a link
 * to /login?redirect=...) — without this check, honoring the param
 * directly would make login/register open redirects. `//evil.example`
 * is rejected alongside absolute URLs since browsers treat a
 * leading-`//` path as protocol-relative to another origin.
 */
export function safeRedirect(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}
