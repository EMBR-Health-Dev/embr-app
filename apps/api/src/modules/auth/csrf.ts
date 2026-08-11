import type { NextFunction, Request, Response } from "express";
import { AppError } from "@embr/shared";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, setCsrfCookie } from "./cookies.js";
import { generateOpaqueToken } from "./tokens.js";

const CSRF_HEADER = "x-csrf-token";

/**
 * Double-submit-cookie CSRF check. Applied only to state-changing
 * endpoints that act on an *existing* cookie-authenticated session
 * (refresh, logout, change-password) — not to register/login, which
 * don't rely on ambient credentials to take effect.
 *
 * A cross-site attacker can make the browser send cookies automatically,
 * but cannot read `embr_csrf` (not httpOnly, but same-origin-restricted
 * by the browser) to also set the matching header, so a mismatch means
 * the request didn't originate from an EMBR page that read its own
 * cookie.
 *
 * `credentialCookie` names whichever cookie this route's actual
 * credential would arrive in if the client were cookie-authenticated —
 * `ACCESS_TOKEN_COOKIE` for routes gated by `requireAuth()` (which
 * itself accepts either that cookie or a Bearer header), or
 * `REFRESH_TOKEN_COOKIE` for the two routes (`/auth/refresh`,
 * `/auth/logout`) that read the refresh token directly and run before
 * any `requireAuth()` call. When that cookie is absent, the request
 * isn't riding on an ambient credential in the first place — a mobile
 * client presenting its token via Authorization header or request body
 * instead — and CSRF (which specifically exploits a browser
 * *automatically* attaching a cookie the attacker's page can't read or
 * set) doesn't apply to it. Skipping the check here is what makes
 * refresh/logout/logout-all/change-password/session-revoke reachable
 * from mobile at all; without it those clients have no CSRF cookie to
 * present and would be permanently locked out of them.
 */
export function requireCsrfToken(credentialCookie: string = ACCESS_TOKEN_COOKIE) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.cookies?.[credentialCookie]) {
      return next();
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.header(CSRF_HEADER);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return next(AppError.forbidden("Missing or invalid CSRF token"));
    }

    next();
  };
}

/** Issues (or refreshes) the CSRF cookie the frontend must echo back. */
export function issueCsrfToken(res: Response): string {
  const token = generateOpaqueToken();
  setCsrfCookie(res, token);
  return token;
}
