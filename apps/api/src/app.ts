import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { requestIdMiddleware } from "@embr/shared";
import { env } from "./config/env.js";
import { httpLoggerMiddleware } from "./middleware/http-logger.js";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the Express app without starting it — kept separate from
 * server.ts so integration tests (Supertest) can import `createApp()`
 * directly instead of binding a real port per test file.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Global-rate-limit as a defense-in-depth backstop; per-route limits
  // (login, password reset) are added in Milestone 2.
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(requestIdMiddleware());
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(globalLimiter);
  app.use(httpLoggerMiddleware());

  // ---- API docs ----
  try {
    const openapiPath = join(__dirname, "..", "..", "..", "docs", "openapi.yaml");
    const openapiDocument = YAML.parse(readFileSync(openapiPath, "utf-8"));
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
  } catch {
    // In minimal/prod-slim images docs/ may not be copied — non-fatal.
  }

  // ---- Routes ----
  app.use(healthRouter);

  // ---- 404 + error handling (must be last) ----
  app.use(notFoundMiddleware());
  app.use(errorHandlerMiddleware());

  return app;
}
