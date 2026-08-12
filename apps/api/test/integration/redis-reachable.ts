import { connect } from "node:net";

/**
 * A raw TCP reachability check, deliberately not using the real
 * `ioredis` client (see lib/redis.ts) for this probe — that client
 * retries internally (maxRetriesPerRequest) before rejecting, and each
 * of those retries is its own command-level promise; when several
 * integration test files in the same run each construct their own
 * client instance against an unreachable Redis, those retry cycles
 * were producing a pile of separately-unhandled rejections rather
 * than one clean, attributable failure. A short-timeout raw socket
 * check has none of that machinery — it just answers "is anything
 * listening here" in under a second, so `describe.skipIf` can decide
 * whether to even construct a real client before any of that runs.
 */
export function isRedisReachable(url: string, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "127.0.0.1";
    let port = 6379;
    try {
      const parsed = new URL(url);
      host = parsed.hostname || host;
      port = parsed.port ? Number(parsed.port) : port;
    } catch {
      // Malformed REDIS_URL — treat as unreachable rather than throw
      // from a test-gating helper.
      resolve(false);
      return;
    }

    const socket = connect({ host, port, timeout: timeoutMs });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
