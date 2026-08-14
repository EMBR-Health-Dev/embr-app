import { Router, type Router as ExpressRouter } from "express";
import type { HealthCheckResponse } from "@embr/types";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { verifyMailTransport } from "../modules/auth/mailer.js";
import { asyncHandler } from "../lib/async-handler.js";

const router: ExpressRouter = Router();
const START_TIME = Date.now();
const VERSION = process.env.npm_package_version ?? "0.1.0";

/**
 * Liveness probe — process is up and can respond. Must never touch the
 * network or a dependency; used by orchestrators to decide whether to
 * restart the container.
 */
router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * Readiness probe — process AND its dependencies (DB, Redis) are
 * reachable. Used by orchestrators/load balancers to decide whether to
 * route traffic to this instance.
 */
router.get(
  "/health/ready",
  asyncHandler(async (_req, res) => {
    const checks: HealthCheckResponse["checks"] = {};

    checks.database = await timedCheck(async () => {
      await prisma.$queryRaw`SELECT 1`;
    });

    checks.redis = await timedCheck(async () => {
      await redis.ping();
    });

    // Deliberately excluded from `allOk` below — see verifyMailTransport's
    // doc comment. Reported for visibility (so a broken SMTP config in
    // staging is a thing you can *see* by hitting this endpoint,
    // instead of discovering it only when a real user's verification
    // email silently never arrives), but a mail-provider outage
    // shouldn't take an otherwise-healthy API instance out of a load
    // balancer's rotation.
    const smtpCheck = await timedCheck(verifyMailTransport);

    const allOk = Object.values(checks).every((c) => c.status === "ok");
    checks.smtp = smtpCheck;

    const body: HealthCheckResponse = {
      status: allOk ? "ok" : "degraded",
      uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
      version: VERSION,
      checks,
    };

    res.status(allOk ? 200 : 503).json(body);
  }),
);

async function timedCheck(
  fn: () => Promise<void>,
): Promise<{ status: "ok" | "down"; latencyMs?: number; message?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "down", message: err instanceof Error ? err.message : "unknown error" };
  }
}

export { router as healthRouter };
