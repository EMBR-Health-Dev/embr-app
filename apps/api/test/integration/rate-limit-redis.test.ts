import { randomUUID } from "node:crypto";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// redisRateLimitStore (src/lib/rate-limit-store.ts) returns undefined —
// falling back to express-rate-limit's in-memory store — whenever
// env.NODE_ENV === "test", specifically so the rest of this suite never
// needs a real Redis just to exercise a rate-limited route. That's exactly
// the behavior this file needs to bypass: it's the one place that wants the
// *real* RedisStore, backed by a real Redis, so the shared-counter guarantee
// the store exists for is actually exercised end-to-end (SCRIPT LOAD /
// EVALSHA and all) rather than asserted from reading the source.
//
// See test/rate-limit-store.test.ts for the corresponding regression test
// that the NODE_ENV=test fallback itself still works.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, NODE_ENV: "production" as const } };
});

const { redisRateLimitStore } = await import("../../src/lib/rate-limit-store.js");
const { redis } = await import("../../src/lib/redis.js");

/**
 * A minimal app with one rate-limited route, standing in for "one API
 * process". Building a fresh app (and Store) per call is what lets the
 * "shared across instances" test below construct two independent stores —
 * exactly as two separate API processes would each construct their own —
 * and confirm they still enforce one combined limit because they share the
 * same Redis and key prefix.
 */
function buildLimitedApp(options: { prefix: string; limit: number; windowMs: number }) {
  const app = express();
  app.get(
    "/ping",
    rateLimit({
      windowMs: options.windowMs,
      limit: options.limit,
      standardHeaders: true,
      legacyHeaders: false,
      store: redisRateLimitStore(options.prefix),
    }),
    (_req, res) => res.status(200).json({ ok: true }),
  );
  return app;
}

// Every test gets its own prefix so runs (and tests within this file)
// can't see each other's counters, without needing a shared afterEach
// cleanup step.
function uniquePrefix() {
  return `rl:test-${randomUUID()}:`;
}

beforeAll(async () => {
  // Fails fast with a clear message rather than every test below timing
  // out individually if there's no Redis reachable at REDIS_URL.
  await expect(redis.ping()).resolves.toBe("PONG");
});

afterAll(async () => {
  await redis.quit();
});

describe("redisRateLimitStore against a real Redis", () => {
  it("enforces one shared limit across two independently-constructed app instances", async () => {
    const prefix = uniquePrefix();
    // Two separately-built apps with their own Store instance, same prefix
    // — this is the multi-process scenario the store exists for.
    const instanceA = buildLimitedApp({ prefix, limit: 3, windowMs: 60_000 });
    const instanceB = buildLimitedApp({ prefix, limit: 3, windowMs: 60_000 });

    await request(instanceA).get("/ping").expect(200);
    await request(instanceA).get("/ping").expect(200);
    await request(instanceB).get("/ping").expect(200);

    // A 4th request on either instance should now be blocked. With the
    // in-memory store this fix replaced, instance B would only have seen
    // one request of its own and would incorrectly allow this through.
    await request(instanceB).get("/ping").expect(429);
    await request(instanceA).get("/ping").expect(429);
  });

  it("keeps different prefixes isolated from each other", async () => {
    const prefixOne = uniquePrefix();
    const prefixTwo = uniquePrefix();
    const appOne = buildLimitedApp({ prefix: prefixOne, limit: 1, windowMs: 60_000 });
    const appTwo = buildLimitedApp({ prefix: prefixTwo, limit: 1, windowMs: 60_000 });

    await request(appOne).get("/ping").expect(200);
    // appOne is now at its limit — appTwo, on a different prefix (as the
    // login/register/password-reset/refresh limiters are in production),
    // must be unaffected.
    await request(appTwo).get("/ping").expect(200);
    await request(appOne).get("/ping").expect(429);
  });

  it("resets the counter once the window elapses", async () => {
    const prefix = uniquePrefix();
    const app = buildLimitedApp({ prefix, limit: 1, windowMs: 300 });

    await request(app).get("/ping").expect(200);
    await request(app).get("/ping").expect(429);

    await new Promise((resolve) => setTimeout(resolve, 400));

    await request(app).get("/ping").expect(200);
  });

  it("fails closed (blocks the request) when Redis errors, since passOnStoreError is not set", async () => {
    // express-rate-limit defaults passOnStoreError to false: a store error
    // propagates as a thrown error rather than silently letting the
    // request through. For a brute-force-protection limiter that's the
    // right default, but it's a real availability tradeoff worth having a
    // test document explicitly — a Redis outage means auth endpoints start
    // erroring, not that they stop being rate-limited.
    const prefix = uniquePrefix();
    const app = buildLimitedApp({ prefix, limit: 5, windowMs: 60_000 });

    // rate-limit-redis retries once on any sendCommand failure (reloading
    // the Lua script, in case the failure was a NOSCRIPT after a Redis
    // restart) before giving up — so the mock has to keep failing across
    // that retry, not just the first attempt, or this would pass by
    // accident via the retry's real, unmocked call succeeding.
    const callSpy = vi.spyOn(redis, "call").mockRejectedValue(new Error("ECONNREFUSED"));
    try {
      const res = await request(app).get("/ping");
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      callSpy.mockRestore();
    }
  });
});
