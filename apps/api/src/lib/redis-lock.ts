import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";
import { logger } from "./logger.js";

// Compare-and-delete: only removes the key if it still holds the
// token this exact acquisition set, so a lock that outlived its TTL
// and was re-acquired by someone else can never be released out from
// under them by the original (now-stale) holder calling release()
// late.
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export type LockResult =
  | { status: "acquired"; release: () => Promise<void> }
  // SET NX genuinely returned "already set" — Redis is reachable and
  // another request holds this exact key right now.
  | { status: "held" }
  // The acquisition attempt itself failed (Redis unreachable, timed
  // out, etc.) — distinct from "held" so callers can choose a
  // different fallback for "no coordination available" than for "a
  // real concurrent holder exists."
  | { status: "unavailable" };

/**
 * Best-effort distributed lock keyed by an arbitrary string, backed by
 * the same Redis instance the rate limiters already use (see
 * lib/redis.ts) — no new infrastructure. SET key token PX ttlMs NX is
 * the acquisition; release is a Lua compare-and-delete keyed off a
 * random per-acquisition token so ownership can't be spoofed by a
 * second caller that raced in after this lock's TTL already expired.
 *
 * Deliberately does not retry or block waiting for the lock — a
 * caller that wants "try once, then decide what to do" (this is what
 * brief.service.ts needs: distinguish a real concurrent holder from
 * Redis being down, not queue behind either) gets exactly that from
 * the three-way `status`.
 */
export async function acquireLock(key: string, ttlMs: number): Promise<LockResult> {
  const token = randomUUID();
  let result: "OK" | null;
  try {
    result = await redis.set(key, token, "PX", ttlMs, "NX");
  } catch (err) {
    logger.warn({ err, key }, "redis lock acquisition failed — treating as unavailable");
    return { status: "unavailable" };
  }

  if (result !== "OK") {
    return { status: "held" };
  }

  return {
    status: "acquired",
    release: async () => {
      try {
        await redis.eval(RELEASE_SCRIPT, 1, key, token);
      } catch (err) {
        // Not fatal — the bounded TTL is the real backstop here, this
        // just means the lock lingers a little longer than it needed
        // to instead of forever.
        logger.warn({ err, key }, "redis lock release failed — it will expire via TTL");
      }
    },
  };
}
