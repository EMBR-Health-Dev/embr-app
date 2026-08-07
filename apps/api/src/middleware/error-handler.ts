import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, ErrorCode } from "@embr/shared";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/sentry.js";

/**
 * Single place where every thrown error becomes an HTTP response.
 * Route handlers and services never call res.status().json() for errors
 * themselves — they throw, and this catches it. Keeps error shape (and
 * logging) consistent across ~every~ endpoint the platform will ever have.
 */
export function errorHandlerMiddleware() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const appError = normalizeError(err);

    const logPayload = {
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
      code: appError.code,
      statusCode: appError.statusCode,
      context: appError.context,
    };

    if (appError.statusCode >= 500) {
      logger.error({ ...logPayload, err }, appError.message);
      // Only 5xx: 4xx are expected client/validation errors, not incidents.
      captureException(err, logPayload);
    } else {
      logger.warn(logPayload, appError.message);
    }

    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        requestId: req.requestId,
        ...(appError.details ? { details: appError.details } : {}),
      },
    });
  };
}

function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.validation(
      "Request validation failed",
      err.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    );
  }

  // body-parser (and other middleware built on the same `http-errors`
  // convention — cookie-parser, multer, etc.) throws a plain Error with a
  // numeric `.status`/`.statusCode` already set to the right 4xx code —
  // e.g. 400 for malformed JSON, 415 for an unsupported charset. Without
  // this check, every one of those fell through to the generic-Error
  // branch below and came back as a 500: wrong status code to the client,
  // logged at `error` instead of `warn`, and paged to Sentry as a real
  // incident for what's just a client sending a malformed request body —
  // exactly the alert-fatigue problem the 4xx/5xx log-level split below
  // exists to prevent.
  //
  // The message is safe to pass straight through here (unlike the
  // internal-error branch below, which redacts in production): these
  // errors describe what's wrong with the *request itself* — not internal
  // state — so there's nothing here that isn't already implied by the
  // request the client just sent.
  if (err instanceof Error && hasClientErrorStatus(err)) {
    return new AppError({ code: ErrorCode.VALIDATION_ERROR, message: err.message, cause: err });
  }

  if (err instanceof Error) {
    return AppError.internal(
      process.env.NODE_ENV === "production" ? "An unexpected error occurred" : err.message,
      err,
    );
  }

  return AppError.internal();
}

function hasClientErrorStatus(err: Error): boolean {
  const status =
    (err as { status?: unknown; statusCode?: unknown }).status ??
    (err as { statusCode?: unknown }).statusCode;
  return typeof status === "number" && status >= 400 && status < 500;
}

/** 404 fallback for unmatched routes — runs before the error handler. */
export function notFoundMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    next(AppError.notFound(`Route ${req.method} ${req.originalUrl}`));
  };
}

// Re-exported so route handlers can reference it without importing @embr/shared directly.
export { ErrorCode };
