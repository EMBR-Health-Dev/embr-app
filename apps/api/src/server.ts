import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

const app = createApp();

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  logger.info({ port: env.API_PORT, host: env.API_HOST, env: env.NODE_ENV }, "api listening");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutdown signal received, closing gracefully");

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "error while closing http server");
    }
    try {
      await Promise.all([prisma.$disconnect(), redis.quit()]);
    } finally {
      process.exit(err ? 1 : 0);
    }
  });

  // Force-exit if graceful shutdown hangs (e.g. a stuck connection).
  setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception — exiting");
  process.exit(1);
});
