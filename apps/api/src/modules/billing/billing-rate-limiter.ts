import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/**
 * Same cost-control reasoning as briefs/brief-rate-limiter.ts, not
 * anti-brute-force: this endpoint is requireAuth()-gated already, and
 * every call creates a real Stripe Checkout Session (and, on a first
 * call, a real Stripe Customer). 20/hour is well above any real "an
 * ORG_ADMIN is adjusting seats" use case while capping the blast
 * radius of a client bug that loops.
 */
function keyByUserId(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

const skipInTest = () => env.NODE_ENV === "test";

export const checkoutSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserId,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:billing-checkout:"),
  skip: skipInTest,
});
