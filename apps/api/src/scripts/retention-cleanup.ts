// Deletes already-dead Session/EmailVerificationToken/PasswordResetToken
// rows past a grace period beyond their expiry — see
// retention.repository.ts's doc comment for exactly what counts as
// "dead" and why a grace period exists at all.
//
// Run via: pnpm --filter @embr/api exec tsx src/scripts/retention-cleanup.ts
// Intended to run on a schedule (see .github/workflows/retention.yml),
// matching scripts/db-backup.sh's pattern — a plain script triggered by
// a cron workflow, not a new always-running service.
//
// Uses this app's own real Prisma client (lib/prisma.ts) rather than a
// separate DB connection — this is a maintenance task on this app's
// own data, not a candidate for the (currently otherwise idle)
// apps/worker BullMQ pathway, which would mean standing up new
// queue-producer wiring for no benefit over a plain scheduled script.

import { retentionService } from "../modules/retention/retention.service.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

async function main() {
  const result = await retentionService.runCleanup();
  logger.info(result, "retention cleanup completed");
}

main()
  .catch((err) => {
    logger.error({ err }, "retention cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
