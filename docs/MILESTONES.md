# Milestones

## Milestone 1 — Production Foundation ✅ (this delivery)

**What changed**

- pnpm workspace + Turborepo monorepo: `apps/{api,web,admin,worker}`, `packages/{shared,types,validation,sdk,ui}`
- `apps/api`: Express + TypeScript, request-ID propagation, structured Pino logging (with secret redaction), centralized `AppError` taxonomy + global error handler, Zod-validated env config, Prisma (empty schema) + Redis clients, `/health/live` and `/health/ready` probes, OpenAPI spec served at `/docs`
- `apps/worker`: BullMQ + Redis, graceful shutdown, shared logger
- `apps/web`, `apps/admin`: Next.js 15 / React 19 shells, Tailwind configured with the EMBR brand palette (navy/bone/brass/teal), each fetching API health as a live wiring smoke test
- Docker Compose: Postgres, Redis, MailHog, and all four apps, with healthchecks and correct `depends_on` ordering
- Multi-stage Dockerfiles per app (deps → build → slim runtime, non-root user)
- GitHub Actions CI: lint/typecheck → test (against real Postgres+Redis services) → build
- ESLint (flat-config-compatible `.eslintrc.json`), Prettier, Husky + lint-staged pre-commit
- Vitest + Supertest wired in `apps/api` with passing tests for both health endpoints, request-ID echo, and the 404 error shape

**Why it changed**
See `docs/ARCHITECTURE.md` for the specific tradeoffs. In short: this milestone intentionally contains zero business features so that every later milestone (auth, symptom tracking, AI insights, payments, multi-tenancy) is built on infrastructure that's already been decided once, correctly, rather than retrofitted under feature pressure.

**Remaining work (explicitly out of scope for M1)**

- No auth, no business domain models, no frontend beyond a health-check smoke test page
- `packages/ui` and `packages/sdk` are intentionally near-empty
- Playwright e2e scaffolding is not yet wired (added when `apps/web` has real user-facing flows to test in Milestone 2/3)
- No pnpm-lock.yaml is committed yet — generate it with `pnpm install` after pulling this into a real git history, then commit it (CI depends on `--frozen-lockfile`)

**Risks**

- Docker image sizes/build times not yet benchmarked against real dependency trees — revisit after `pnpm install` produces a real lockfile
- Rate limiting is a single global limiter; brute-force protection on auth endpoints needs its own, stricter limiter in Milestone 2
- No secrets manager integration yet (`.env` only) — needs a decision (AWS Secrets Manager / Doppler / etc.) before production deploy, likely around Milestone 5/6

**Next milestone**
Milestone 2 — Authentication: registration, login, refresh tokens, password reset, email verification, device sessions, RBAC, rate limiting on auth routes specifically, audit logging, secure cookies, CSRF protection, session revocation.

## Milestone 2 — Authentication ✅ (this delivery)

**What changed**

- Prisma models: `User` (with `Role` enum), `Session` (refresh-token-backed device sessions), `EmailVerificationToken`, `PasswordResetToken`, `AuditLog`
- `apps/api/src/modules/auth`: registration, login, refresh (with rotation + reuse detection — a revoked token being replayed revokes every session for that user), logout, logout-all, email verification + resend, forgot/reset/change-password, `/auth/me`, session listing + per-session revocation
- Argon2id password hashing (OWASP-recommended parameters); opaque, SHA-256-hashed refresh tokens (never stored or transmitted as JWTs)
- Short-lived JWT access tokens (httpOnly cookie, with an `Authorization: Bearer` fallback for non-browser clients), httpOnly refresh-token cookie scoped to `/auth`
- Double-submit-cookie CSRF protection on every state-changing endpoint that acts on an existing session (refresh, logout, logout-all, change-password, session revocation) — not on register/login, which don't rely on ambient cookie auth to take effect
- Per-route rate limiting on auth endpoints specifically (keyed by email+IP where an email is present), stricter than the global API limiter
- Append-only `AuditLog` for register/login (success+failure)/refresh/reuse-detection/logout/password-change/password-reset events
- Transactional email (verification, password reset) via nodemailer → MailHog in dev
- Shared Zod validation schemas (`packages/validation`) and DTOs (`packages/types`) so `apps/web`/`apps/admin` can reuse the exact same contracts
- `requireAuth()` / `requireRole()` middleware for RBAC on future protected routes
- Vitest + Supertest coverage: registration (incl. duplicate-email conflict, weak-password rejection), login (incl. same-shape 401 for wrong-password vs. non-existent account — no enumeration), `/auth/me` auth gating, CSRF enforcement, and refresh-token rotation/reuse-detection

**Why it changed**
Argon2id + opaque hashed refresh tokens + rotation-with-reuse-detection is the combination OWASP currently recommends for session security; building it once, correctly, here avoids revisiting session handling once real user data exists. CSRF protection is scoped to cookie-authenticated state changes only (not to register/login) because that's where the actual ambient-credential attack surface is — over-applying it elsewhere adds friction without adding safety.

**Known limitation — verify before merging**
This was built in a network-sandboxed environment that cannot reach `binaries.prisma.sh`, so `prisma generate` could not run here, and the Prisma-dependent code (`lib/prisma.ts`, `modules/auth/auth.repository.ts`, `modules/auth/auth.mappers.ts`) was reviewed by hand rather than fully typechecked locally. Separately — and this part is now fixed and confirmed working in CI, not just a sandbox artifact — the original CI workflow and the root `db:generate`/`db:migrate`/`db:studio` scripts used `pnpm --filter @embr/api prisma <command>`, which pnpm silently interprets as "run the npm script named `prisma`" rather than "execute the `prisma` binary." Since no such script exists, this printed a warning and exited 0 without doing anything — meaning Milestone 1's CI never actually ran `prisma generate` or `prisma migrate deploy` at all, on any commit, despite reporting success. Fixed by using `pnpm --filter @embr/api exec prisma <command>` everywhere (CI workflow and root `db:*` scripts) — confirmed via CI logs that the client now generates correctly and typecheck passes end-to-end.

**Remaining work (explicitly out of scope for M2)**

- No initial Prisma migration file is committed yet — generate it once `prisma generate` can run (see limitation above)
- `requireVerifiedEmail` gating (blocking specific actions until email is confirmed) is not yet wired into any route, since no such actions exist until Milestone 3
- No account lockout after N failed logins beyond the rate limiter (a deliberate simplification — revisit if abuse patterns emerge)
- No OAuth/social login, no MFA — email+password only for this milestone

**Next milestone**
Milestone 3 — Core domain: symptom logging, cycle tracking entries, and the first real data model built on top of `User`.

## Milestone 3 — Core domain ✅ (this delivery)

**What changed**

- Prisma models: `SymptomLog` (category/severity/occurredAt/notes) and `CycleEntry` (date/flow/period start-end markers/notes), both `userId`-scoped and cascade-deleted with their owning `User`
- `CycleEntry` has a `@@unique([userId, date])` constraint — one entry per user per calendar day, so re-logging a day upserts (corrects) rather than duplicating
- `apps/api/src/modules/symptoms` and `apps/api/src/modules/cycle`: full CRUD (`POST` create/upsert, `GET` list with pagination + filtering, `GET :id`, `PATCH :id`, `DELETE :id`), all behind `requireAuth()`
- **Ownership scoping at the query level, not the service level**: every single-resource lookup filters `where: { id, userId }` in the same Prisma call, so a valid id belonging to another user is indistinguishable from an id that doesn't exist — both return a plain 404, never a 403 that would confirm the record exists
- Symptom logs are filterable by `category` and an `occurredAt` date range; cycle entries by a `date` range; both paginated via the shared `paginationQuerySchema`/`PaginatedResponse<T>` (new in `packages/types`)
- Shared Zod schemas (`packages/validation`) and DTOs (`packages/types`) for both domains, following the same pattern auth established
- Vitest + Supertest coverage for both modules: creation, validation rejection, list filtering, and — the important case — that cross-user access returns 404 on read _and_ write, while the owner can read/update/delete normally

**Why it changed**
Query-level ownership scoping (`findFirst({ where: { id, userId } })` / `updateMany`/`deleteMany` with the same compound filter, checking the affected-row count rather than fetching first) means there is no code path where a route handler could forget to check ownership — the check is structurally part of every query, not a separate `if` a future contributor could omit. The upsert-by-date design for `CycleEntry` reflects that a person will often want to correct today's entry rather than see two hot flashes logged as two separate untracked events; the alternative (reject duplicate dates, force a separate edit endpoint) adds friction for a very common real-world correction with no real benefit.

**Remaining work (explicitly out of scope for M3)**

- No aggregate/trend endpoints yet (e.g. "hot flashes per week," cycle-length calculation) — this milestone is the raw data layer; analysis views are a natural M4 candidate once there's real usage data to validate the shape of
- No data export (CSV/PDF for a clinician visit) — flagged as a likely near-term ask given EMBR's clinical-data-platform positioning, but deliberately deferred until the core logging experience is validated
- `ADMIN` role has no special access to symptom/cycle data in this milestone (by design — this is personal health data; any future clinician-facing aggregate view should be explicitly scoped and audited, not fall out of the existing RBAC middleware by default)

**Next milestone**
Milestone 4 — to be scoped based on what Milestones 2–3 reveal is actually needed next (candidates: trend/aggregate views over the M3 data, data export, or `apps/web`'s first real authenticated screens consuming the M2/M3 API).

## Milestone 4 — apps/web frontend ✅

Register/login/dashboard screens consuming the M2/M3 API through a same-origin proxy (`next.config.ts` rewrites `/api/*` to the API server, so its cookies land as ordinary first-party cookies in the browser — no CORS or cross-site cookie handling needed). See the commit for full detail; summarized here so the milestone list stays linear:

- `/register`, `/login` — client-side validation reuses the API's own Zod schemas
- `/dashboard` — gated by an `AuthProvider` that checks `/auth/me` once per load; one-tap "log a hot flash right now" as the signature interaction, a fuller symptom form, same-day cycle quick-log, and recent history
- Typography extends the existing navy/bone/brass/teal palette (Fraunces/IBM Plex Sans via `next/font/google`) rather than introducing a new one

## Milestone 5 — Trends ✅ (this delivery)

**What changed**

- `/trends` page: symptom frequency by category over the last 90 days (simple proportional bar list, no charting dependency needed for this shape of data), and cycle length between consecutive period-start days over the last 180 days, with an average when there's enough data
- Computed entirely client-side from the existing `GET /symptom-logs` and `GET /cycle-entries` list endpoints (extended with `from`/`to` support in `apps/web`'s API client) — no new backend endpoint for this milestone
- Deliberately non-diagnostic language throughout: cycle irregularity is framed as expected during perimenopause, and the page states outright that it's a personal record, not a diagnosis

**Why it changed**
Aggregation client-side (rather than a new `/trends` API endpoint) was the right call for this milestone specifically because the computation is cheap, the dataset per user is small, and it avoids committing to an aggregate API shape before real usage shows what views people actually want. This is a explicit trade-off, not an oversight — revisit if/when trends need to run over data volumes too large to fetch and reduce in the browser.

**Known limitation**
List endpoints cap at `pageSize: 100` (see `packages/validation`'s `paginationQuerySchema`), so a 90-day symptom window with very frequent logging (>100 entries) would silently undercount here. Fine for this milestone's real usage; a dedicated aggregate endpoint (`GROUP BY category` server-side) is the fix if that becomes a real constraint.

**Next milestone**
To be scoped from here — candidates: data export (CSV/PDF for a clinician visit), hardening `apps/admin`, or a dedicated server-side aggregate endpoint if the client-side approach above stops being sufficient.
