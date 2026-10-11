import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/** Bounds how fast one account can write notes, same reasoning as the
 * treatment and symptom write limiters: not brute force, just a ceiling
 * on unbounded row volume, well above real use. */
function keyByUserId(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

const skipInTest = () => env.NODE_ENV === "test";

export const noteWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserId,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:note-write:"),
  skip: skipInTest,
});
