import pino from "pino";

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  pretty?: boolean;
}

/**
 * Creates a structured Pino logger for a given service.
 *
 * Every log line carries `service` so logs from api/worker/web can be
 * correlated in a shared aggregator (e.g. Datadog, CloudWatch) without
 * grepping by filename.
 */
export function createLogger(options: LoggerOptions) {
  const {
    serviceName,
    level = process.env.LOG_LEVEL ?? "info",
    pretty = process.env.NODE_ENV !== "production",
  } = options;

  return pino({
    level,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.token",
        "*.refreshToken",
        "*.accessToken",
      ],
      censor: "[REDACTED]",
    },
    transport: pretty
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        }
      : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
