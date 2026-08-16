import rateLimit from "express-rate-limit";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/** Unauthenticated and side-effect-free (pure arithmetic, nothing
 * persisted), so the global limiter in app.ts already bounds the worst
 * case reasonably well. This exists anyway as the tighter, dedicated
 * limit every other public-facing or sensitive route in this app gets
 * (see auth/rate-limiters.ts) — cheap insurance for the one route in
 * the whole API that requires no login at all before hitting it. */
export const assessmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:assessment:"),
  skip: () => env.NODE_ENV === "test",
});
