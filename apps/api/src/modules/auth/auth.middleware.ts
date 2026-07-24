import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { AppError } from "@embr/shared";
import type { Role } from "@embr/types";
import { verifyAccessToken, type AccessTokenPayload } from "./tokens.js";
import { ACCESS_TOKEN_COOKIE } from "./cookies.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

function extractAccessToken(req: Request): string | undefined {
  // Cookie first (web/admin apps); Authorization header as a fallback
  // for non-browser clients (mobile, service-to-service) that can't
  // hold cookies.
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) return cookieToken;

  const header = req.header("authorization");
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);

  return undefined;
}

/** Verifies the access token and attaches `req.user`. Throws 401 if
 * missing, expired, or invalid — never falls through silently. */
export function requireAuth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractAccessToken(req);
    if (!token) {
      return next(AppError.unauthorized("Authentication required"));
    }

    try {
      req.user = verifyAccessToken(token);
      next();
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return next(AppError.unauthorized("Access token expired"));
      }
      if (err instanceof JsonWebTokenError) {
        return next(AppError.unauthorized("Invalid access token"));
      }
      next(AppError.unauthorized());
    }
  };
}

/** Must run after requireAuth(). Returns 403 (not 401) — the caller is
 * authenticated, just not authorized for this resource. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden());
    }
    next();
  };
}
