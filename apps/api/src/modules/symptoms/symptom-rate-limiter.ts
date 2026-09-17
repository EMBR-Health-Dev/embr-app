import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../../config/env.js";
import { redisRateLimitStore } from "../../lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "../../lib/rate-limit-handler.js";

/**
 * Unlike auth/rate-limiters.ts's limiters (anti-brute-force on
 * unauthenticated endpoints), this exists to bound a compromised or
 * malicious *authenticated* account writing rows at unbounded volume —
 * requireAuth() alone doesn't limit how many times one account can
 * call this. 120/hour is generous enough that no real person logging
 * symptoms — even someone having a genuinely rough day — would ever
 * notice it; it exists purely to cap the blast radius of abuse or a
 * client bug that loops.
 */
function keyByUserId(req: Request): string {
  return req.user?.sub ?? req.ip ?? "unknown";
}

const skipInTest = () => env.NODE_ENV === "test";

export const symptomLogWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserId,
  handler: rateLimitExceededHandler,
  store: redisRateLimitStore("rl:symptom-log-write:"),
  skip: skipInTest,
});
