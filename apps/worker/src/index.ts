import { Worker, type Job } from "bullmq";
import { createLogger } from "@embr/shared";
import { env } from "./env.js";
import { initSentry, captureException } from "./sentry.js";

const logger = createLogger({ serviceName: "worker" });

initSentry(logger);

/**
 * Placeholder queue so the BullMQ + Redis wiring, graceful shutdown, and
 * structured logging are proven out in Milestone 1. Real queues
 * (ai-insight-generation, report-pdf-export, reminder-emails, ...) are
 * added in Milestones 3-4 following this exact pattern.
 */
// BullMQ requires maxRetriesPerRequest: null on any connection given to a
// Worker — Workers use blocking Redis commands (BRPOPLPUSH and similar)
// that must be allowed to keep retrying indefinitely rather than give up
// after ioredis's default retry limit. Omitting this either throws at
// startup or silently stalls job processing, depending on version — see
// https://docs.bullmq.io/guide/connections. Nothing in CI actually starts
// this process against a real Redis instance, so this was latent since
// Milestone 1 with no test ever exercising it.
const connection = { url: env.REDIS_URL, maxRetriesPerRequest: null };

const worker = new Worker(
  "system-maintenance",
  async (job: Job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "processing job");
    return { processedAt: new Date().toISOString() };
  },
  { connection },
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));
worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "job failed");
  captureException(err, { jobId: job?.id, jobName: job?.name });
});

logger.info("worker started, listening on queue: system-maintenance");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
  captureException(reason);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception — exiting");
  captureException(err);
  process.exit(1);
});
