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
    // Scoped to /api/auth, not /auth — deliberately matching the path
    // apps/web (and apps/admin) actually request at, not this API's
    // own internal route path. Both of those apps talk to the API
    // exclusively through their own Next.js server's rewrite proxy
    // (see apps/web/next.config.ts: `/api/:path* -> API_URL/:path*`),
    // which is transparent to the *browser* — the browser only ever
    // sees requests going to `/api/auth/refresh`, never `/auth/refresh`
    // directly, and a cookie's Path is matched against the request URL
    // the browser itself sends, not whatever path the proxy forwards
    // to server-side. A cookie scoped to `/auth` here would never be
    // attached to any request either of those apps actually makes,
    // silently breaking refresh for every cookie-authenticated web
    // client the moment their access token expires (15 minutes) —
    // exactly the failure mode this scoping exists to prevent, just
    // aimed at the wrong path. Mobile is unaffected either way: it
    // never reads this cookie at all, presenting its refresh token in
    // the request body instead (see auth.routes.ts's /auth/refresh
    // handler).
    path: "/api/auth",
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
  // Must match setRefreshTokenCookie's path exactly — clearCookie only
  // actually clears a cookie the browser holds if the Path attribute
  // matches what it was originally set with; a mismatch here would
  // silently leave the real refresh-token cookie behind after
  // logout/account-deletion.
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...opts, path: "/api/auth" });
  res.clearCookie(CSRF_COOKIE, { ...opts, httpOnly: false });
}
