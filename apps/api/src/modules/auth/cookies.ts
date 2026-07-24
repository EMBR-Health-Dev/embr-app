import type { Response } from "express";
import { env } from "../../config/env.js";

export const ACCESS_TOKEN_COOKIE = "embr_at";
export const REFRESH_TOKEN_COOKIE = "embr_rt";
export const CSRF_COOKIE = "embr_csrf";

/**
 * Base flags shared by both auth cookies. `httpOnly` keeps them out of
 * reach of any injected script (mitigating XSS token theft); `sameSite:
 * lax` blocks the cookie being sent on cross-site subrequests/top-level
 * navigations from third parties while still allowing normal same-site
 * navigation and top-level links to work. `secure` is env-driven so
 * local HTTP dev isn't broken, but must be true in any real deployment.
 */
function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN,
    path: "/",
  };
}

export function setAccessTokenCookie(res: Response, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

export function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...baseCookieOptions(),
    path: "/auth", // only sent to auth endpoints — narrows the CSRF/leak surface
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

/** Double-submit CSRF cookie — deliberately NOT httpOnly, since the
 * frontend must read it and echo it back in a request header. */
export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: "lax" as const,
    domain: env.COOKIE_DOMAIN,
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  const opts = baseCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, opts);
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...opts, path: "/auth" });
  res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
}
