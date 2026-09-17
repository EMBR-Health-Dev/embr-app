import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/**
 * Same reasoning as symptoms/symptom-rate-limiter.ts: bounds a
 * compromised or malicious authenticated account writing rows at
 * unbounded volume, not brute force. Treatments are logged far less
 * often than symptoms (a handful of active treatments, occasionally
 * added/edited), so a lower ceiling than symptom logging's still
 * leaves generous headroom for real use.
 */
function keyByUserId(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

const skipInTest = () => env.NODE_ENV === "test";

export const treatmentWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserId,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:treatment-write:"),
  skip: skipInTest,
});
