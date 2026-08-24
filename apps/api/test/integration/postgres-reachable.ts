import { connect } from "node:net";

/**
 * A raw TCP reachability check for Postgres, mirroring
 * isRedisReachable (see redis-reachable.ts for the full rationale) —
 * a short-timeout socket probe rather than letting PrismaClient itself
 * attempt the connection, so `describe.skipIf` can decide whether to
 * even construct a client before any query machinery (or its retry/
 * timeout behavior) runs.
 */
export function isPostgresReachable(url: string, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    let host = "127.0.0.1";
    let port = 5432;
    try {
      const parsed = new URL(url);
      host = parsed.hostname || host;
      port = parsed.port ? Number(parsed.port) : port;
    } catch {
      // Malformed DATABASE_URL — treat as unreachable rather than throw
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
