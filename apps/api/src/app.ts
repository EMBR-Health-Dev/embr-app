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
import { redisRateLimitStore } from "./lib/rate-limit-store.js";
import { rateLimitExceededHandler } from "./lib/rate-limit-handler.js";
import { errorHandlerMiddleware, notFoundMiddleware } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { symptomRouter } from "./modules/symptoms/symptom.routes.js";
import { treatmentRouter } from "./modules/treatments/treatment.routes.js";
import { cycleRouter } from "./modules/cycle/cycle.routes.js";
import { exportRouter } from "./modules/export/export.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { trendsRouter } from "./modules/trends/trends.routes.js";
import { reflectionRouter } from "./modules/reflections/reflection.routes.js";
import { organizationRouter } from "./modules/organizations/organization.routes.js";
import { ssoRouter } from "./modules/sso/sso.routes.js";
import { briefRouter } from "./modules/briefs/brief.routes.js";
import { onboardingRouter } from "./modules/onboarding/onboarding.routes.js";
import { publicAssessmentRouter } from "./modules/public-assessment/public-assessment.routes.js";
import { billingRouter } from "./modules/billing/billing.routes.js";
import { billingWebhookRouter } from "./modules/billing/billing.webhook.routes.js";

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
  // (login, password reset) are added in Milestone 2. Redis-backed so
  // the limit is enforced across every API instance sharing this
  // Redis, not just per-process (see lib/rate-limit-store.ts). Skipped
  // in tests for the same reason rate-limiters.ts skips its own
  // limiters there: every test file's Redis mock only stubs `ping`,
  // not the `call` this store needs, and rate limiting itself isn't
  // what those tests are exercising.
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitExceededHandler,
    store: redisRateLimitStore("rl:global:"),
    skip: () => env.NODE_ENV === "test",
  });

  app.use(requestIdMiddleware());
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
    }),
  );
  // env.CORS_ORIGIN is comma-separated — a single value (the default)
  // behaves exactly as before; this only starts mattering once a
  // second origin (the landing page) is added in a real deployment.
  // credentials: true stays correct either way — it only governs
  // whether cookies get forwarded *if* the browser sends them, and the
  // landing page's own requests to /public/perimenopause-assessment
  // never carry EMBR's session cookie in the first place (different
  // origin, unauthenticated endpoint, nothing to send).
  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header at all — same-origin requests, curl, server-
        // to-server health checks — always allowed; CORS only exists to
        // constrain browsers making cross-origin requests in the first
        // place.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(globalLimiter);
  // The Stripe webhook route is mounted here — after the global rate
  // limiter but before express.json() — and owns its own
  // express.raw() body parser scoped to exactly that one path (see
  // billing.webhook.routes.ts). Signature verification needs the
  // exact raw bytes Stripe signed; if express.json() ran first, it
  // would consume the request stream and hand the webhook route an
  // already-parsed object with no way to recover the original bytes.
  // Every other route is unaffected — this router matches only
  // POST /billing/webhook.
  app.use(billingWebhookRouter);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
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
  app.use(authRouter);
  app.use(symptomRouter);
  app.use(treatmentRouter);
  app.use(cycleRouter);
  app.use(exportRouter);
  app.use(adminRouter);
  app.use(trendsRouter);
  app.use(reflectionRouter);
  app.use(organizationRouter);
  app.use(billingRouter);
  app.use(ssoRouter);
  app.use(briefRouter);
  app.use(onboardingRouter);
  app.use(publicAssessmentRouter);

  // ---- 404 + error handling (must be last) ----
  app.use(notFoundMiddleware());
  app.use(errorHandlerMiddleware());

  return app;
}
