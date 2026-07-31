import type { NextFunction, Request, Response } from "express";
import { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { AppError } from "@embr/shared";
import type { OrgRole, Role } from "@embr/types";
import { prisma } from "../../lib/prisma.js";
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

/**
 * Must run after requireAuth(). Checks membership + org-role against
 * the `:organizationId` route param — a platform ADMIN does NOT
 * automatically pass this (see Milestone 7's scope boundary: platform
 * admin is account/audit metadata visibility, not a backdoor into
 * every organization's roster). Cross-org access — a valid
 * organizationId the caller simply isn't a member of — returns the
 * same 404 an invalid id would, for the same reason Milestone 3's
 * ownership-scoped queries never distinguish "not yours" from
 * "doesn't exist."
 */
export function requireOrgRole(...roles: OrgRole[]) {
  // Wrapped in the same try/catch-then-next(err) shape asyncHandler
  // applies to route handlers — Express 4 does not await middleware
  // functions, so an unhandled rejection here (this does a real DB
  // call) would otherwise escape as an unhandled promise rejection
  // instead of reaching the error handler.
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      try {
        if (!req.user) {
          return next(AppError.unauthorized());
        }
        const organizationId = req.params.organizationId as string | undefined;
        if (!organizationId) {
          return next(AppError.internal("requireOrgRole used on a route with no :organizationId"));
        }

        const membership = await prisma.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId, userId: req.user.sub } },
        });

        if (!membership) {
          return next(AppError.notFound("Organization"));
        }
        if (!roles.includes(membership.role as OrgRole)) {
          return next(AppError.forbidden());
        }

        req.orgMembership = membership;
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgMembership?: { organizationId: string; userId: string; role: string };
    }
  }
}
