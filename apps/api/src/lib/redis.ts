import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

// This client backs the auth rate limiters (see lib/rate-limit-store.ts),
// and express-rate-limit fails closed on a store error by default
// (passOnStoreError is not set — see
// test/integration/rate-limit-redis.test.ts) — so a Redis outage doesn't
// just degrade rate limiting, it makes auth endpoints start erroring
// outright. Without these listeners, that would first show up as an
// unexplained spike in 500s on unrelated-looking endpoints; with them, a
// disconnect/reconnect is a distinct, greppable/alertable log event in
// its own right, on top of health.ts's point-in-time `/health/ready` check.
redis.on("error", (err) => {
  logger.error({ err }, "redis connection error");
});
redis.on("connect", () => {
  logger.info("redis connected");
});
redis.on("reconnecting", (delayMs: number) => {
  logger.warn({ delayMs }, "redis reconnecting");
});
redis.on("end", () => {
  logger.warn("redis connection closed");
});
