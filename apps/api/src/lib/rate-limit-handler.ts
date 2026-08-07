import type { NextFunction, Request, Response } from "express";
import { AppError, ErrorCode } from "@embr/shared";

/**
 * express-rate-limit's default `handler` calls `res.send()` with a plain
 * text message — `text/html`, no `error.code`, no `requestId` — which is a
 * different response shape from every other error in this API (see
 * middleware/error-handler.ts). Any limiter that doesn't set a custom
 * `handler` silently breaks that contract the moment it actually trips.
 *
 * Routing through `next(...)` instead lets the global error handler apply
 * the same shape, logging, and Sentry rules to a 429 as to everything else.
 */
export function rateLimitExceededHandler(_req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError({
      code: ErrorCode.RATE_LIMITED,
      message: "Too many requests — please try again later",
    }),
  );
}
