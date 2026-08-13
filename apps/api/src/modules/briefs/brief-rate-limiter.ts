import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/**
 * Unlike auth/rate-limiters.ts's limiters (anti-brute-force, keyed by
 * IP or email+IP on unauthenticated endpoints), this one exists purely
 * for cost control: every generation is a real Anthropic API call, and
 * this endpoint sits behind requireAuth(), so the thing worth bounding
 * is "how many times can one account generate a brief," not "how many
 * requests from one IP." 10/hour is well above any real GP-prep use
 * case (a handful of these a day would be a lot) while still capping
 * the blast radius of a client bug that loops, or an account
 * generating far more than anyone would organically need.
 */
function keyByUserId(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

const skipInTest = () => env.NODE_ENV === "test";

export const briefGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserId,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:brief-generate:"),
  skip: skipInTest,
});
