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

## Milestone 6 — Data export ✅ (this delivery)

**What changed**

- `GET /export/symptom-logs.csv`, `GET /export/cycle-entries.csv`, `GET /export/summary.pdf` — all authenticated, all scoped to the requesting user's own data, all accepting optional `from`/`to` range params
- The PDF (`pdfkit`, no external font fetch — deliberately avoided given `apps/web`'s Google Fonts sandbox-network experience in Milestone 4) is a clinician-facing summary: symptom frequency by category, average cycle length, and the full symptom log for the range, with the same non-diagnostic framing established in Milestone 5's trends page
- CSV export via a small hand-rolled RFC 4180 serializer (no dependency needed for this shape of data)
- Every export writes a `DATA_EXPORTED` audit log entry — exporting personal health data out of the system is exactly the kind of event the audit trail established in Milestone 2 exists to capture
- `apps/web`'s `/export` page: date-range inputs and three download links, using plain `<a href>` navigation rather than a fetch-and-blob dance — these are authenticated same-origin GETs and, per the CSRF design established in Milestone 2, GETs never need the CSRF header (only state-changing endpoints do)
- 5 new backend tests (34 total), including a real check that the PDF response starts with the `%PDF-` magic bytes rather than just asserting a 200 and a content-type header

**Why it changed**
Export deliberately bypasses the `pageSize: 100` cap that both the list endpoints and (per Milestone 5's known limitation) trends inherit — a clinician export needs "everything in the range," not a page of it. Rather than remove pagination limits generally, `exportRepository` adds its own unpaginated queries with a hard 5000-row safety ceiling, keeping the ordinary list endpoints' pagination behavior untouched while giving export the semantics it actually needs.

**Remaining work (explicitly out of scope for M6)**

- No email delivery of the export (e.g. "send this to my doctor") — download-only for this milestone
- The 5000-row export cap is a safety ceiling, not a real pagination story; if a user's history ever approaches it, that's a signal for genuine streaming export, not a bigger number

**Next milestone**
To be scoped from here — candidates: hardening `apps/admin`, a dedicated server-side aggregate endpoint for trends, or whatever real usage of the last six milestones surfaces as actually missing.

## Milestone 7 — apps/admin ✅ (this delivery)

**What changed**

- `GET /admin/users` and `GET /admin/audit-logs`, both `requireAuth() + requireRole("ADMIN")`, and each view itself writes an audit log entry (`ADMIN_VIEWED_USERS` / `ADMIN_VIEWED_AUDIT_LOGS`) — an admin looking at account data is exactly the kind of event the audit trail exists to capture
- No admin endpoint touches `SymptomLog` or `CycleEntry` — deliberately. This is the line drawn back in Milestone 3's design note ("any future clinician-facing aggregate view should be explicitly scoped and audited, not fall out of the existing RBAC middleware by default"), now actually enforced by what the admin router does and doesn't include, not just documented as an intention
- No self-service admin promotion endpoint — admin accounts are promoted out-of-band (direct DB access), matching the fact that this is genuinely an operational/ops action, not a product feature
- Full `apps/admin` frontend: a login page that distinguishes "wrong password" (401, same shape as the consumer app) from "correct login, but not an admin" (a distinct message, and the session is immediately logged out rather than left sitting authenticated with no admin capability), and a tabbed dashboard (Users / Audit log)
- Preserved and extended `apps/admin`'s existing inverted dark theme (navy background, bone text) from Milestone 1 rather than overriding it with `apps/web`'s light palette — that inversion was already a deliberate scaffold decision worth keeping as the visual signal that this is the internal console, not the consumer app
- 6 new backend tests (40 total): RBAC enforcement (401 unauthenticated, 403 authenticated-non-admin), correct pagination, and an explicit check that password hashes never leak into the user-list response

**Why it changed**
Keeping admin visibility to account metadata and the audit trail — and nothing about what anyone has actually logged — is a scope boundary worth holding even under pressure to make the admin console "more useful." A support/ops need for "see what's happening with this account" is well served by registration status, verification status, and the security event history; it doesn't require reading someone's symptom log, and building the feature to allow that by default would be solving a support problem by weakening a privacy boundary.

**Remaining work (explicitly out of scope for M7)**

- No user search/filtering beyond pagination (fine at current scale; revisit if the user list ever needs it)
- No account actions (suspend, force-logout-everywhere, manually verify) — this milestone is read-only visibility, not account management
- No audit log export — if that becomes a real compliance need, it should follow the same pattern Milestone 6 established for personal-data export, not be bolted on ad hoc

**Next milestone**
To be scoped from here — candidates: a dedicated server-side aggregate endpoint for trends (see Milestone 5's known limitation), admin account-management actions if real ops need surfaces them, or whatever real usage of the platform so far turns out to actually be missing.

## Milestone 8 — Account settings UI ✅ (this delivery)

**What changed**

- New `apps/web` `/settings` page: change password, and view/revoke device sessions, with a "log out everywhere" action — all backed by API endpoints that have existed since Milestone 2 but were never exposed anywhere in the consumer frontend
- The change-password flow explicitly surfaces the fact that it signs the user out everywhere, including the current device (the API revokes every session on password change, by design, for security) — the redirect to `/login?reason=password-changed` is expected behavior with its own confirmation message, not treated as an error path
- The device list marks the current session distinctly and only offers "Revoke" on the others — revoking your own current session from this screen would be a confusing dead end (you'd need `logoutAll`/`logout` for that, both of which already exist as separate explicit actions)
- Fixed a real Next.js 15 requirement while building this: `useSearchParams()` (used to read the `?reason=` param on the login page) must be wrapped in a `Suspense` boundary or it can fail static generation — verified against Next's own error messaging and structured accordingly, though this sandbox's Google Fonts network block means the actual `next build` could only be confirmed in CI, not locally

**Why it changed**
This was the most concrete "close the loop" feature available: real, tested backend capability with zero frontend surface. Building a new domain feature would have been guessing at what's actually valuable next; exposing account security controls that already exist and are already covered by Milestone 2's test suite was not a guess.

**Next milestone**
To be scoped from here — same open candidates as before (trends aggregate endpoint, admin account-management actions), plus now: `apps/admin` still has no equivalent settings/session-management UI for admin accounts themselves, which is a symmetrical gap to the one this milestone just closed for the consumer app.

## Milestone 9 — Server-side trends aggregate ✅ (this delivery)

**What changed**

- `GET /trends/symptom-frequency` — counts symptom logs by category over an optional `from`/`to` range, computed with Prisma's `groupBy` (`COUNT ... GROUP BY category` in Postgres), sorted descending by count
- `GET /trends/cycle-length` — diffs consecutive period-start dates in range and returns both the per-pair lengths and the average, mirroring the exact computation `apps/web`'s trends page used to do client-side
- Both routes live in a new `apps/api/src/modules/trends` module (repository/service/routes, same shape as every other domain module), both `requireAuth()`-gated, both added to `docs/openapi.yaml`
- `apps/web`'s `/trends` page now calls these two endpoints instead of fetching `pageSize: 100` pages of raw logs/entries and aggregating them client-side — same UI, same copy, same non-diagnostic framing, different data path
- `trendsRepository.periodStartDates` applies the same generously-sized safety cap `exportRepository` established in Milestone 6 (this one's local to the module rather than shared, since it's the only other place that needs an unpaginated-but-bounded fetch); symptom frequency needs no equivalent cap since `groupBy` returns one row per category, not one row per log
- 6 new backend tests (46 total): auth gating on both routes, an aggregate-correctness test that logs 120 symptom entries specifically to prove counting isn't silently capped at 100, `from`/`to` range filtering, and cycle-length diffing/averaging including a check that non-period-start entries are correctly excluded from the diff

**Why it changed**

This is the fix for the limitation Milestone 5 flagged when trends first shipped: the client-side approach fetched at most `pageSize: 100` rows per window, so a 90-day symptom window with more than 100 logged entries would silently undercount rather than error. Moving the counting into Postgres removes that ceiling entirely for symptom frequency — `groupBy` aggregates over every matching row before anything crosses the wire, so no page size is involved.
Cycle length isn't a pure DB-side aggregate the way frequency is (it's a sequential diff between dates, not a count), so it keeps a bounded fetch — but the bound here is a generous safety ceiling shared with the export pattern, not the tight 100-row list-endpoint default that caused the original problem.

**Remaining work (explicitly out of scope for M9)**

- No caching — every call recomputes from Postgres. Fine at current scale; worth revisiting only if trends become a high-traffic read path
- `apps/admin` has no visibility into aggregate trend data, by the same deliberate scope boundary Milestone 7 drew (admin sees account/audit metadata, never symptom or cycle content)
- The two endpoints still take separate `from`/`to` windows per call (matching `apps/web`'s existing 90-day symptom / 180-day cycle window split) rather than a single combined `/trends` response — kept as two resources since the windows genuinely differ and combining them would mean the caller always fetches both even when only one is needed

**Next milestone**
To be scoped from here — same open candidates as before (admin account-management actions, `apps/admin` settings/session UI), plus whatever real usage of the trends view surfaces as actually missing now that the undercounting limitation is closed.
