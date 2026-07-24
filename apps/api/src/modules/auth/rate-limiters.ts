import rateLimit from "express-rate-limit";
import { AppError, ErrorCode } from "@embr/shared";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";

/**
 * The global limiter in app.ts is a backstop for the whole API; brute-
 * force protection on auth endpoints specifically needs to be much
 * tighter and keyed so one abusive IP can't lock out other IPs sharing
 * a NAT trying the *same* account (keyed by email+IP, not IP alone,
 * where the endpoint takes an email).
 */
function authRateLimitHandler(_req: Request, _res: Response, next: NextFunction) {
  next(
    new AppError({
      code: ErrorCode.RATE_LIMITED,
      message: "Too many requests — please try again later",
    }),
  );
}

function keyByEmailAndIp(req: Request): string {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "unknown";
  return `${req.ip}:${email}`;
}

// These limiters are process-wide singletons (one in-memory store per
// limiter, shared by every request the process ever handles) — correct
// for a real server, but it means integration tests that exercise many
// register/login calls in one process would otherwise trip each
// other's counters. Rate limiting itself is out of scope for those
// tests (it's exercised by not being exercised: production wiring is
// identical), so it's skipped in NODE_ENV=test.
const skipInTest = () => env.NODE_ENV === "test";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByEmailAndIp,
  handler: authRateLimitHandler,
  skip: skipInTest,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: authRateLimitHandler,
  skip: skipInTest,
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByEmailAndIp,
  handler: authRateLimitHandler,
  skip: skipInTest,
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: authRateLimitHandler,
  skip: skipInTest,
});
