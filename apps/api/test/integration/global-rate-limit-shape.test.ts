import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The global backstop limiter (app.ts) is skipped in NODE_ENV=test (see
// the comment on globalLimiter), same as the per-route auth limiters, so
// this — like test/integration/rate-limit-redis.test.ts — forces
// redisRateLimitStore off that fallback to exercise the real path against
// a real Redis, specifically to check the *shape* of what a real 429
// returns to a client.
vi.mock("../../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/env.js")>();
  return { ...actual, env: { ...actual.env, NODE_ENV: "production" as const } };
});
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));

const { isRedisReachable } = await import("./redis-reachable.js");

// See redis-reachable.ts / rate-limit-redis.test.ts for why this is a raw
// socket probe rather than beforeAll pinging the real ioredis client —
// the real client (imported below, only once we know it's worth it)
// connects eagerly at import time (lazyConnect: false).
const redisReachable = await isRedisReachable(process.env.REDIS_URL ?? "redis://localhost:6379");

describe.skipIf(!redisReachable)("global rate limiter error shape", () => {
  let createApp: (typeof import("../../src/app.js"))["createApp"];
  let redis: (typeof import("../../src/lib/redis.js"))["redis"];

  beforeAll(async () => {
    ({ createApp } = await import("../../src/app.js"));
    ({ redis } = await import("../../src/lib/redis.js"));
  });

  afterAll(async () => {
    await redis.quit();
  });
  it("returns the API's standard error shape, not express-rate-limit's default text/html message", async () => {
    const app = createApp();

    let last: request.Response | undefined;
    // limit: 300 in a 60s window (app.ts) — well within one test's timeout.
    for (let i = 0; i < 305; i++) {
      last = await request(app).get("/health/live");
      if (last.status === 429) break;
    }

    expect(last?.status).toBe(429);
    expect(last?.headers["content-type"]).toContain("application/json");
    expect(last?.body.error.code).toBe("RATE_LIMITED");
    expect(last?.body.error.requestId).toBeDefined();
  }, 20_000);
});
