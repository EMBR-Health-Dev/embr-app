import { Worker, type Job } from "bullmq";
import { createLogger } from "@embr/shared";
import { env } from "./env.js";

const logger = createLogger({ serviceName: "worker" });

/**
 * Placeholder queue so the BullMQ + Redis wiring, graceful shutdown, and
 * structured logging are proven out in Milestone 1. Real queues
 * (ai-insight-generation, report-pdf-export, reminder-emails, ...) are
 * added in Milestones 3-4 following this exact pattern.
 */
const connection = { url: env.REDIS_URL };

const worker = new Worker(
  "system-maintenance",
  async (job: Job) => {
    logger.info({ jobId: job.id, jobName: job.name }, "processing job");
    return { processedAt: new Date().toISOString() };
  },
  { connection },
);

worker.on("completed", (job) => logger.info({ jobId: job.id }, "job completed"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "job failed"));

logger.info("worker started, listening on queue: system-maintenance");

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down worker");
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
