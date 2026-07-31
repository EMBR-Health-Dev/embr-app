import { RedisStore } from "rate-limit-redis";
import { redis } from "./redis.js";
import { env } from "../config/env.js";

/**
 * A shared Redis-backed store for every express-rate-limit instance in
 * this process. Without this, each limiter's counters live in that
 * process's own memory — correct for exactly one API instance, but
 * once there's more than one behind a load balancer, each instance
 * enforces its own separate limit. That's a real gap specifically for
 * the auth limiters (login/register/password-reset), which exist for
 * brute-force protection: with N instances, an attacker effectively
 * gets `limit * N` attempts rather than `limit`, not just a fairness/
 * perf nit.
 *
 * `prefix` keeps each limiter's keys in its own Redis namespace so the
 * (per-endpoint) login/register/reset/refresh/global limiters never
 * collide with each other or with BullMQ's own keys on the same Redis
 * instance.
 *
 * Returns `undefined` in NODE_ENV=test rather than a RedisStore:
 * RedisStore's constructor eagerly calls `sendCommand` itself (to load
 * a Lua script) before any request ever comes in — a limiter's own
 * `skip` option only governs per-request enforcement, not this
 * construction-time call, so it can't be relied on to keep tests away
 * from Redis. Returning `undefined` lets express-rate-limit fall back
 * to its default in-memory store, which is harmless here precisely
 * because every limiter that uses this is already skipped in tests.
 */
export function redisRateLimitStore(prefix: string) {
  if (env.NODE_ENV === "test") {
    return undefined;
  }
  return new RedisStore({
    // ioredis's call() matches the (command, ...args) => Promise<T>
    // shape rate-limit-redis's sendCommand expects.
    sendCommand: (...args: string[]) => redis.call(...args) as Promise<unknown>,
    prefix,
  });
}
