import type { NextFunction, Request, Response } from "express";
import { AppError } from "@embr/shared";
import { CSRF_COOKIE, setCsrfCookie } from "./cookies.js";
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
 */
export function requireCsrfToken() {
  return (req: Request, _res: Response, next: NextFunction) => {
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
