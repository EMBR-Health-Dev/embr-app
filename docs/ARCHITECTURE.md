# Architecture

Internal engineering architecture for the EMBR platform.
Acquirer-facing overview (proprietary vs third-party, switching cost):
`docs/acquisition/architecture.md`.
Deployment topology and production config: `docs/DEPLOYMENT.md`.

_Last aligned with the codebase: October 2026._

## System overview

```text
  Web (Next.js 15)   Admin (Next.js 15)   Mobile (Expo / RN)
         │                  │                    │
         └──────────────────┴─────────┬──────────┘
                                      │  same-origin /api proxy (web, admin)
                                      │  direct HTTPS (mobile)
                                   API
                          Express + TypeScript
                          Prisma → PostgreSQL
                          Redis (sessions, rate limits, BullMQ)
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
               Anthropic API     Resend email     Stripe (optional)
              (BRIEF narrative    (transactional)   (org billing)
               only; counts only)
```

| App / package         | Role                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`            | Source of truth for auth, domain data, BRIEF, export, admin metrics                                                                       |
| `apps/web`            | Patient product                                                                                                                           |
| `apps/admin`          | Ops console: accounts, audit log, product metrics — never individual health rows                                                          |
| `apps/mobile`         | Expo companion; same API contracts as web                                                                                                 |
| `apps/worker`         | BullMQ process; **deployed but no product job is enqueued yet** — placeholder only                                                        |
| `packages/shared`     | Logger, `AppError`, env validation, HTTP middleware                                                                                       |
| `packages/types`      | Shared DTOs                                                                                                                               |
| `packages/validation` | Shared Zod schemas (API + clients)                                                                                                        |
| `packages/ui`         | Shared React components                                                                                                                   |
| `packages/sdk`        | **Unused.** Minimal hand-written health client only; web and mobile use their own `lib/api.ts`. Do not treat as the API client of record. |

## Principles

- **Business logic never lives in controllers.** Routes parse and validate, then call a service; repositories own persistence.
- **Throw, don't respond.** Services throw `AppError` (`@embr/shared`); only `errorHandlerMiddleware` maps errors to HTTP. One response shape for every endpoint.
- **OpenAPI documents the contract; it does not generate clients.** `docs/openapi.yaml` is updated with new endpoints. Typed clients live in `apps/web` and `apps/mobile` (`lib/api.ts`) against `packages/types` and `packages/validation`. Drift is caught by review and tests, not codegen.
- **Cross-cutting code lives in `packages/shared`.** API and worker share the same logger, errors, and env loader.
- **Fail fast on bad config.** `loadEnv()` (Zod) validates at boot. Missing required secrets crash startup with a clear message.
- **Ownership is in the query, not an after-the-fact check.** Resource lookups use `where: { id, userId }` (or org membership). Cross-user access returns 404, not 403 that would confirm existence.
- **Personal free text is encrypted at rest; structured counts are not.** Notes, notebook pages, treatment names, and stored BRIEF wording use AES-256-GCM (`docs/ENCRYPTION.md`). Categories, severities, and dates stay queryable in SQL. The AI receives aggregate counts and patterns only — never notes or treatment names.
- **Admin never reads individual health data.** Admin endpoints cover users, audit logs, and anonymized metrics only.

## Request lifecycle (`apps/api`)

1. `requestIdMiddleware` — assign / propagate `x-request-id`
2. `helmet`, `cors`, `compression`, `cookie-parser`, JSON body parsing
3. Global `express-rate-limit` (stricter per-route limits on auth)
4. `httpLoggerMiddleware` — one structured line per completed request
5. Route (thin) → service → repository / Prisma
6. `notFoundMiddleware` / `errorHandlerMiddleware`

Auth: short-lived JWT access token (httpOnly cookie or Bearer), opaque hashed refresh tokens with rotation and reuse detection, double-submit CSRF on cookie-authenticated state changes. Mobile sends tokens in the body where cookies are unavailable.

## Domain shape (high level)

| Area      | Models / modules                                                 | Notes                                                                          |
| --------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Auth      | User, Session, tokens, AuditLog                                  | Argon2id passwords; role `MEMBER` \| `ADMIN`                                   |
| Record    | SymptomLog, CycleEntry / bleeding, ContextLog, treatments, notes | Longitudinal patient record                                                    |
| Clinical  | BRIEF pipeline (deterministic patterns → optional AI wording)    | Point-in-time snapshots; re-download is stable                                 |
| Org / B2B | Organization, membership, invites, SSO                           | Org admin sees roster + k-anonymized aggregates only                           |
| MRS       | `mrs_check_ins`                                                  | Feature-flagged until commercial licence is confirmed (`docs/MRS-CHECK-IN.md`) |

## Durable decisions (still true)

| Decision                                               | Why                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `/health/live` vs `/health/ready`                      | Liveness ≠ readiness; avoids restart loops when a dependency is slow                |
| Global error handler normalizes Zod errors             | One 400 shape; routes cannot forget to format validation failures                   |
| Query-level ownership scoping                          | No code path that “forgets” the userId check                                        |
| Worker scaffolded early                                | Topology and CI cost less than retrofitting later; product jobs still optional      |
| Field encryption in the Prisma client layer            | Repositories never see plaintext personal text; none can forget to encrypt          |
| BRIEF: deterministic evidence first, AI wording second | Clinical logic stays testable and provider-swappable; AI is not the source of truth |

## What is intentionally not architecture here

- Milestone history → `docs/MILESTONES.md` (changelog of how we got here, not current design)
- Launch gates and legal → `docs/LAUNCH-READINESS.md`, `docs/planning/`
- Backup / restore mechanics → `docs/BACKUPS.md`
- Retention of dead sessions/tokens → `docs/RETENTION.md`
- Product metrics definitions → `docs/METRICS.md`

## Known gaps (engineering, not product roadmap)

| Gap                                                 | Status                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/sdk` unused; OpenAPI not wired to codegen | Accept for now; clients are hand-maintained. Either generate from OpenAPI later or remove the package to reduce confusion |
| Worker has no real jobs                             | Safe to leave deployed; do not treat its health as product health                                                         |
| Client-side error monitoring (web / admin / mobile) | Not configured; API/worker Sentry only when `SENTRY_DSN` is set                                                           |
| Activity metrics use UTC calendar days              | Documented in `docs/METRICS.md`; per-user time zones not stored                                                           |
