# Architecture

## Principles

- **Business logic never lives in controllers.** Routes parse/validate input and call a service; services hold logic; repositories (added alongside Prisma models from Milestone 2) own persistence. This keeps route handlers thin and testable in isolation from Express.
- **Throw, don't respond.** Route/service code throws `AppError` (see `@embr/shared`); the single `errorHandlerMiddleware` in `apps/api` is the only place that turns an error into an HTTP response. This guarantees every endpoint — including ones written months from now — returns the same JSON error shape.
- **OpenAPI is the contract.** `docs/openapi.yaml` is written before or alongside new endpoints. `packages/sdk` will generate its client from it starting Milestone 2, so the frontend can never silently drift from what the API actually returns.
- **Everything cross-cutting lives in `packages/shared`,** not duplicated per-app. Logging, error taxonomy, env validation, and request-ID propagation are identical in `apps/api` and `apps/worker` because they import the same code, not because someone remembered to copy it correctly.
- **Fail fast on bad config.** `loadEnv()` (Zod) validates `process.env` at process boot. A missing `DATABASE_URL` is a crash-on-startup with a clear message, not a confusing 500 three requests later.

## Request lifecycle (apps/api)

1. `requestIdMiddleware` — assigns/propagates `x-request-id`
2. `helmet`, `cors`, `compression`, `cookie-parser`, JSON body parsing
3. `express-rate-limit` — global backstop (per-route limits added Milestone 2)
4. `httpLoggerMiddleware` — one structured log line per completed request
5. Route handler (thin) → service → repository/Prisma
6. `notFoundMiddleware` / `errorHandlerMiddleware` — last in the chain, catch everything

## Why these tradeoffs

| Decision                                                   | Alternative considered                             | Why this one                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma schema ships empty in M1                            | Stub out a `User` model early                      | A stub model would need reshaping once real auth requirements (M2) are known; empty schema means zero migration debt                                                                                      |
| `admin` + `worker` scaffolded now, not deferred            | Add them only when M4/M6 need them                 | Turborepo pipeline, CI matrix, and Docker Compose topology are cheaper to get right once, now, than to retrofit under deadline pressure later                                                             |
| Health checks split into `/health/live` vs `/health/ready` | Single `/health` endpoint                          | Orchestrators need liveness (restart decision) and readiness (traffic-routing decision) to be independently answerable — conflating them causes restart loops when a dependency is merely slow            |
| Global error handler normalizes Zod errors too             | Validate manually in each route and hand-roll 400s | One normalization path means validation errors, thrown `AppError`s, and unexpected exceptions all produce the identical response shape, with zero chance of a route handler forgetting to catch something |
