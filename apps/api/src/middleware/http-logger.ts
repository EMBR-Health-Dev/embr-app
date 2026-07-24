import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

/**
 * Logs one structured line per request on completion (not on entry) so
 * status code and duration are always present in a single, greppable
 * event rather than split across two log lines.
 */
export function httpLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          userAgent: req.header("user-agent"),
        },
        "request completed",
      );
    });

    next();
  };
}
