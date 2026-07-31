import { describe, expect, it } from "vitest";
import { redisRateLimitStore } from "../src/lib/rate-limit-store.js";

// This is deliberately separate from test/integration/rate-limit-redis.test.ts,
// which mocks config/env.js to exercise the real RedisStore path. This file
// runs with the suite's actual env (NODE_ENV=test, set in test/setup.ts) to
// guard the other half of redisRateLimitStore's contract: every other test
// file in this suite relies on rate limiters being no-ops in NODE_ENV=test
// (see the `skip: skipInTest` on each limiter in rate-limiters.ts, and the
// comment on redisRateLimitStore itself), and none of them can safely reach
// a real Redis via SCRIPT LOAD/EVALSHA calls at construction time. If this
// regresses, every route-level test that exercises a rate-limited endpoint
// gets flaky or hangs, for a reason far removed from whatever it's actually
// testing — so it's worth a dedicated, obvious-to-find test.
describe("redisRateLimitStore in NODE_ENV=test", () => {
  it("returns undefined so express-rate-limit falls back to its in-memory store", () => {
    expect(redisRateLimitStore("rl:test-guard:")).toBeUndefined();
  });

  it("returns undefined regardless of prefix", () => {
    expect(redisRateLimitStore("rl:another-prefix:")).toBeUndefined();
    expect(redisRateLimitStore("")).toBeUndefined();
  });
});
