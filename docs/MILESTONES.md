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

## Milestone 10 — apps/admin settings UI ✅ (this delivery)

**What changed**

- New `apps/admin` `/settings` page: change password and device session management, identical in capability to Milestone 8's `apps/web` version, adapted to the admin app's inverted dark theme — closes the symmetrical gap Milestone 9 flagged
- Same design decisions as Milestone 8 for the same reasons: change-password explicitly surfaces that it signs out every session including the current one, and the device list only offers "Revoke" on non-current sessions

**A process note, not a product change**
While verifying this locally, `apps/api`'s test suite briefly failed 4 tests with 500 errors immediately after pulling in Milestone 9's merge — not a bug in that work (its own CI run had already passed cleanly), but a stale local `packages/validation` build artifact: `pnpm --filter @embr/validation build` hadn't been re-run in this working copy after `trendsQuerySchema` was added, so the compiled `dist/` output being imported at runtime didn't export it yet. Confirmed via CI logs that the actual merged commit was green; fixed locally by rebuilding the package. Worth remembering: a green CI run doesn't guarantee every local working copy is in sync — always rebuild workspace package `dist/` output after pulling in changes that touch `packages/*`, same as any other dependency update.

**Next milestone**
To be scoped from here — same open candidates as before (admin account-management actions, `apps/admin` trend visibility if that scope boundary ever gets revisited), or whatever real usage surfaces as actually missing.

## Milestone 11 — Production hardening ✅ (this delivery)

**What changed**

- **Error monitoring**: `apps/api` and `apps/worker` both gained an `initSentry()` call (in `src/lib/sentry.ts` and `src/sentry.ts` respectively) that's a deliberate no-op unless `SENTRY_DSN` is set — dev and CI need nothing extra. 5xx errors are captured from the central `errorHandlerMiddleware` (4xx aren't — those are expected validation/client errors, not incidents), worker job failures are captured from the existing `failed` listener, and both processes now also report `unhandledRejection`/`uncaughtException` to Sentry before exiting. `beforeSend` on the API side strips `request.cookies`/`request.data` before anything leaves the process, given this handles health data.
- **CI security scanning**: new `security` job in `.github/workflows/ci.yml` — `pnpm audit --audit-level high` (deliberately not `moderate`/`low`, which are noisy enough in the JS ecosystem to make a required check meaningless) plus gitleaks secret scanning on every PR.
- **Coverage enforcement**: `apps/api`'s `test` script now runs `vitest run --coverage` by default (added the missing `@vitest/coverage-v8` dependency — the coverage config existed in `vitest.config.ts` since Milestone 1 but nothing had ever actually invoked it with `--coverage`), with thresholds set conservatively (60/55/60/60) since this shipped without a live Postgres/Redis available to read back the real current number. The report uploads as a CI artifact either way.
- **Dependabot**: weekly automated dependency-update PRs for npm (grouped by minor/patch to avoid one-PR-per-package noise), Docker base images across all four `apps/*/Dockerfile`s, and GitHub Actions versions.
- **Database backups**: `scripts/db-backup.sh` (`pg_dump -Fc` → AES256 gpg encryption → optional S3 upload → retention pruning) and `scripts/db-restore-test.sh` (decrypt → restore into a scratch database → sanity-check row counts), wired into a new scheduled `.github/workflows/backup.yml` — daily backup, weekly restore verification against a disposable Postgres service container. See `docs/BACKUPS.md`.
- **Branch protection**: `scripts/setup-branch-protection.mjs` — a one-time script (not a CI job, since it needs a repo-admin PAT) that configures `main` via the GitHub REST API: all four CI jobs required, 1 approving review, stale reviews dismissed on new commits, force-push and branch-deletion blocked, conversation resolution required.
- **Docs**: `docs/DEPLOYMENT.md` (recommended platforms, secrets-management hierarchy, error-monitoring/health-check setup, rollback strategy), `docs/BACKUPS.md`, `docs/INCIDENT_RESPONSE.md` (severity levels, first-5-minutes checklist, data-integrity/security-specific guidance, postmortem expectations).

**Why it changed**

Milestones 1-10 built real, tested feature capability — the gap this closes is everything between "the tests pass" and "this is safe to run against real patient health data in production." None of this milestone's changes touch product behavior; every prior milestone's tests still cover the same surface they did before.

**A note on what this milestone deliberately did _not_ do**

- Did not actually deploy anything to Railway/Fly/Vercel — no live infrastructure exists yet to point at, and claiming otherwise in this doc would be inaccurate. `docs/DEPLOYMENT.md` is the recommended path for whoever does that next, not a record of it having happened.
- Did not run `scripts/setup-branch-protection.mjs` — it needs a personal access token with admin rights on the actual GitHub repo, which this sandbox doesn't have. Same reasoning for not measuring real coverage numbers: no live Postgres/Redis was available here to run the suite against.
- Did not add Sentry to `apps/web`/`apps/admin` (Next.js) in this pass — `@sentry/nextjs` needs `next.config.js` changes and a build-time source-map upload step that's more invasive than the api/worker addition, and the two Node services (which handle all the actual health-data logic and background jobs) were the higher-value target for a first pass.

**Remaining work (explicitly out of scope for M11)**

- No committed Prisma migration history yet (`apps/api/prisma/` has only `schema.prisma`) — CI's `prisma migrate deploy` step is currently a no-op against an empty migrations directory. This needs `pnpm db:migrate` run once locally to generate and commit the first migration before any real production deploy, independent of anything else in this milestone.
- Sentry for `apps/web`/`apps/admin` (see note above).
- No log aggregation platform (Datadog/CloudWatch/etc.) wired up yet — `packages/shared`'s logger already tags every line with `service` in anticipation of this (see its own doc comment), so adding an aggregator later is a sink configuration change, not a logging-format change.
- No load/performance testing.
- Health-check _monitoring_ (an external uptime service actually polling `/health/ready`) is documented in `docs/DEPLOYMENT.md` as a setup step, not configured against anything, since there's no live URL yet to monitor.

**Next milestone**
To be scoped from here — candidates: whichever of Milestone 12-15's roadmap items (Clinical Intelligence, Provider Portal, Enterprise, Production Launch) actually becomes real priority next, or closing the Prisma-migrations gap flagged above if a real deploy is imminent.

## Milestone 12 — Organizations (Enterprise multi-tenancy foundation) ✅ (this delivery)

**What changed**

- Three new Prisma models: `Organization` (a B2B customer account — employer, insurer, or clinic), `OrganizationMembership` (links a `User` to an `Organization` with an `OrgRole` of `ORG_ADMIN`/`ORG_MEMBER`), and `OrganizationInvite` (single-use, hashed-token invitations — same pattern as `EmailVerificationToken`/`PasswordResetToken`). All additive: a `User` with no membership behaves exactly as it always has.
- New `apps/api/src/modules/organizations` module (mappers/repository/service/routes, same shape as every other domain module) and a new `requireOrgRole()` middleware, parallel to the existing `requireRole()`:
  - `POST /organizations` — platform-`ADMIN`-only org provisioning (deliberately not self-serve — matches the sales-assisted pilot-to-enterprise progression the business already runs on)
  - `GET /organizations` — platform-`ADMIN`-only list, metadata only (name/slug/seat count), same read-only-ops-visibility boundary Milestone 7 already drew for `/admin/users`
  - `GET /organizations/:id` — any member (`ORG_ADMIN` or `ORG_MEMBER`)
  - `GET /organizations/:id/members` / `POST /organizations/:id/invites` / `DELETE /organizations/:id/members/:userId` — `ORG_ADMIN`-only roster management
  - `POST /organizations/invites/accept` — authenticated-user-only, not org-scoped in the URL (the invite token itself carries the organization, which matters for a brand-new user who's never seen that org's id before)
  - `GET /organizations/:id/trends/symptom-frequency` — `ORG_ADMIN`-only anonymized aggregate (see below)
- Cross-org access (a syntactically valid `organizationId` the caller isn't a member of) returns 404, not 403 — same ownership-scoping precedent Milestone 3 established for symptom logs and cycle entries.
- **The privacy boundary this milestone is actually built around**: `OrganizationMembership` grants an `ORG_ADMIN` the member roster and one anonymized, cohort-level aggregate — never an individual member's `SymptomLog`/`CycleEntry` rows. The aggregate endpoint applies a k-anonymity floor (`ORG_TRENDS_MIN_COHORT_SIZE`, default 5): if fewer than that many members have any logged data in the requested range, the response is `{ suppressed: true, cohortSize, categories: [] }` — categories are withheld entirely, not just rounded or omitted individually, so there's no way to back into a small org's real count by narrowing the date range. Cohort size counts distinct members who actually logged something in range, not raw membership count.
- 14 new backend tests (60 total): RBAC on every route (401/403/404, including the cross-org-is-404-not-403 case), duplicate-slug conflict, a full invite → accept round trip (captures the real plaintext token via the mailer call rather than the stored hash, confirms the token can't be reused after acceptance), email-mismatch rejection on accept, roster field-shape (asserts the response has no fields beyond id/userId/email/role/joinedAt), member revocation + re-revoke-404, and both sides of the k-anonymity floor (suppressed under threshold, real counts at/above it).
- `docs/openapi.yaml` updated with all 7 new routes and 5 new schemas — validated against Redocly's linter; the only new finding beyond what the existing file already had is `seatLimit`'s `nullable: true`, which matches the exact style the pre-existing `averageDays` field already uses (an existing OpenAPI 3.1-strictness gap in the file, not something newly introduced here).

**Why it changed**

Of the four Enterprise-epic candidates (Organizations/multi-tenancy, SSO, an enterprise admin console), the other two both depend on this one — SSO needs an organization to bind an identity-provider connection to, and an org-scoped admin console needs org-scoped data to show. Building this first means SSO and the console slot in cleanly later instead of retrofitting a tenancy concept underneath them. Scoped to backend-only for this milestone (no `apps/web`/`apps/admin` UI yet), matching Milestone 9's precedent — auth/registration-flow UI changes for the accept-invite path are a real design surface of their own, better scoped once this foundation is settled rather than guessed at alongside it.

**A verification note for this sandbox**

`prisma generate` is blocked here (`binaries.prisma.sh` returns 403 outside the network allowlist — the same constraint Milestone 2 first flagged), so `apps/api`'s full `tsc --noEmit` couldn't be run end-to-end. What was verified in this environment: `packages/shared`/`packages/types`/`packages/validation` all rebuilt and typechecked clean against the new code; the full `apps/api` test suite (60/60, including all 14 new tests) runs green — these tests mock Prisma entirely, so they don't depend on the generated client; and `eslint`/`prettier` pass clean on every new and modified file.

**Remaining work (explicitly out of scope for M12)**

- No frontend UI — no accept-invite page in `apps/web`, no org roster/aggregate-trends view in `apps/admin` (or a dedicated org-admin surface). Every capability above exists only as an API today.
- No billing/seat-purchase flow — `Organization.seatLimit` exists and is enforced on invite (a full org can't invite past its limit), but nothing sets that limit except direct provisioning; no Stripe or equivalent integration.
- A user can belong to multiple organizations at the schema level (`OrganizationMembership` is a proper join table, not a single `organizationId` column on `User`), but nothing in this milestone's UX assumes or tests that — the invite/accept flow only ever creates one membership at a time. Worth deciding deliberately before it's load-bearing.
- Still true from Milestone 11, unrelated to this work: no committed Prisma migration history yet.
- SSO and the enterprise admin console — the two roadmap items this milestone was explicitly built to unblock, not yet started.

**Next milestone**
To be scoped from here — most likely candidates given this foundation: an `apps/admin`-adjacent org-admin console (roster + the new aggregate-trends endpoint, now that both exist to build a UI against), or SSO if a real enterprise pilot customer's requirements make that the more urgent of the two.

## Repo maintenance — Express types + Next.js ESLint wiring (between M12 and M13 work)

**What changed**

- `@types/express` was pinned to `^5.0.0` in `apps/api` and `packages/shared` while the actual `express` runtime dependency is `^4.21.0` — a major-version type/runtime mismatch. Express 5's types model repeated route params as `string | string[]` (reflecting its `path-to-regexp` v7 behavior), which doesn't apply to the Express 4 app actually running. This was silently producing five `TS2345` errors plus two downstream `TS7031` implicit-any errors in `organization.routes.ts` (the `any`-cascade from `prisma` failing to resolve — see below — was masking these in ad hoc `tsc` runs that only ever checked `apps/web`; this is the first time `apps/api`'s typecheck was run in full in this environment). Fixed by pinning `@types/express` to `^4.17.21` instead of upgrading the runtime to Express 5 mid-project.
- `eslint-config-next` was installed as a dependency in both `apps/web` and `apps/admin` but never actually wired into either app's ESLint flat config — the root `eslint.config.js` has no Next-specific plugin, and neither app had its own config file, so `next lint` was silently falling back to the bare root rules while still reporting "No ESLint warnings or errors." In practice this meant `react-hooks/exhaustive-deps`, `jsx-a11y`, `next/no-img-element`, and the rest of Next's recommended rule set were never actually running in either app. Added a proper `eslint.config.mjs` to each app using `FlatCompat` (the documented way to pull `eslint-config-next`'s eslintrc-style config into flat config) — the same pattern `create-next-app` itself scaffolds for Next 15.
  - Hit and resolved a `Cannot redefine plugin "@typescript-eslint"` collision along the way: the root config's `...tseslint.configs.recommended` and `next/typescript` (via `eslint-config-next`) both register a plugin under the same name, sometimes as non-identical instances depending on pnpm's resolution. Fixed by reconstructing the root config's other pieces (ignores, `js.configs.recommended`, prettier compat, the repo's custom rules) directly in each app's config instead of spreading the root config wholesale, letting `next/typescript` be the sole source of the `@typescript-eslint` plugin in these two apps.
  - `next lint`'s first-run auto-setup also unconditionally adds `allowJs: true` to `tsconfig.json` if the key is absent at all — undesired in an all-TypeScript codebase. An explicit `"allowJs": false` in both tsconfigs stops it from re-adding this on every future `next lint` invocation (confirmed: an absent key gets silently overwritten every run; an explicit `false` is left alone).

**Why it changed**

Found while running a full-repo `pnpm typecheck`/`pnpm lint` audit for the first time (previous milestones only ever spot-checked `apps/web`). Neither issue was caught by any prior milestone's verification because none of them ran `apps/api`'s typecheck or a from-scratch `next lint` in full — the Express types mismatch had presumably been silently wrong since whichever milestone first added `@types/express` (predates this doc's tracking), and the missing Next ESLint wiring predates it too.

**A verification note for this sandbox**

`apps/api`'s `Cannot find module '../generated/prisma'` errors remain and are unrelated to this fix — `prisma generate` is still blocked by the same `binaries.prisma.sh` network restriction flagged since Milestone 2/11/12. Confirmed this is a hard sandbox constraint, not a code issue: even `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` still 403s on the actual engine binary fetch. Everything else verified clean: full monorepo `pnpm typecheck` (all 9 packages except the pre-existing Prisma gap in `@embr/api`), full monorepo `pnpm lint` (all 10 packages, silent — no warnings, no tsconfig-reconfiguration messages), and `apps/api`'s test suite (60/60 against this branch's `main`-based state; mocked-Prisma harness, unaffected either way).

**Remaining work**

- The `apps/api` Prisma-generation gap itself (tracked since Milestone 11) is still open — needs either network allowlist changes or a real (non-sandbox) CI environment to resolve, not something fixable from here.

## Milestone 13 — Org-admin console UI ✅ (this delivery)

**What changed**

- New `GET /organizations/mine` endpoint — the one organization route keyed by the caller's own membership rather than a path param. Every other organization route requires already knowing an `organizationId`; this is what lets a user (most importantly a brand-new `ORG_ADMIN` who just accepted an invite) discover which org(s) they belong to and in what role at all. Registered ahead of `/organizations/:organizationId` in the router — an important ordering detail, since Express matches by registration order and `"mine"` would otherwise be swallowed as an `organizationId` value and 404 rather than match the new route.
- New `apps/web` `/organization` page: org picker (if the caller administers more than one), roster with invite + revoke, and the Milestone 12 anonymized aggregate-trends view — all backed entirely by endpoints that already existed since Milestone 12 plus the one new lookup above.
- Dashboard nav now conditionally shows an "Organization" link — fetched once per authenticated load — only for users `GET /organizations/mine` actually shows an `ORG_ADMIN` membership for, rather than linking everyone to a page that would just say "not applicable."
- The roster view marks the caller's own row ("You") and, matching Milestone 8/10's device-session pattern, only offers "Revoke" on the other rows — revoking your own admin membership from this screen would be a confusing dead end with no undo path.

**Why it changed**

Milestone 12's own "next milestone" note guessed this would land in `apps/admin` — worth correcting here: `ORG_ADMIN` is an `OrgRole` on a regular `User`'s `OrganizationMembership`, granted via `requireOrgRole()`, not the platform-level `Role.ADMIN` that gates `apps/admin` via `requireRole("ADMIN")`. An employer HR contact or insurer account manager is an ordinary EMBR user who happens to administer an org — they log into `apps/web`, the same as any other user, and have no reason to see `apps/admin`'s internal ops console (user list, security audit trail) at all. Building this in `apps/web` isn't a style choice; it's the only placement consistent with the RBAC boundary Milestone 12 already established.

**A verification note for this sandbox**

Same `binaries.prisma.sh` network-allowlist constraint flagged in Milestones 2 and 12: `prisma generate` can't run here, so `apps/api`'s full `tsc --noEmit` still reports the same pre-existing `generated/prisma` module-not-found errors on files this milestone didn't touch — confirmed unchanged by running the same command against `main` before these changes. What was verified clean in this environment: `packages/types`/`packages/validation`/`packages/shared` all rebuild and typecheck; the full `apps/api` test suite (64/64, including 3 new tests for `GET /organizations/mine`) runs green against the mocked-Prisma test harness; `eslint` passes on every new/modified file in both `apps/api` and `apps/web`; and `apps/web`'s `tsc --noEmit` passes clean. `apps/web`'s `next build` itself couldn't complete here — this sandbox has no route to Google Fonts, the same constraint Milestones 4 and 8 already hit — but that's a font-fetch failure unrelated to any code in this milestone, not a build error in the new page.

**Remaining work (explicitly out of scope for M13)**

- No accept-invite UI in `apps/web` yet — an invited user still accepts via the API directly (`POST /organizations/invites/accept`, which the web client now has a method for). This is the other frontend gap Milestone 12 flagged and is a real design surface of its own (a logged-out visitor needs to register/log in first, then have the invite token survive that round trip) — better scoped on its own than folded into this console.
- No self-service "leave organization" action for a member — only an `ORG_ADMIN` revoking someone else, matching what the API already supports.
- SSO — the other item Milestone 12 was built to unblock, still not started.

**Next milestone**
To be scoped from here — candidates: the accept-invite flow flagged above (now the more clearly-scoped of the two remaining frontend gaps), SSO, or closing the still-outstanding Prisma-migrations gap from Milestone 11 if a real deploy is imminent.

## Milestone 14 — Accept-invite flow ✅ (this delivery)

**What changed**

- New `/organizations/accept-invite` page in `apps/web` — the actual target of the link `sendOrganizationInviteEmail` has been sending since Milestone 12 (`${APP_URL}/organizations/accept-invite?token=...`), which until now pointed at a route that didn't exist. Reads `token` from the query string and calls the `POST /organizations/invites/accept` endpoint the web client already had a method for since Milestone 13.
- Handles all three visitor states: **logged out** — shows a choice of log in / create account rather than immediately failing on a 401, since `/organizations/invites/accept` sits behind the same `requireAuth()` as every other organization route; **logged in** — accepts automatically on load and shows who they joined; **already a member** — the accept endpoint's one legitimate 409 case, shown as a soft confirmation rather than an error.
- Added `redirect` query param support to `/login` and `/register` so the invite token survives the register-or-login round trip a logged-out visitor has to take: the accept-invite page hands its own URL (with the token still in it) to whichever auth page the visitor picks, both auth pages thread it through to each other (register's "Already have an account?" / login's "Create an account" links) and, for login specifically, land the visitor back on it after a successful session instead of the usual `/dashboard`. New `safeRedirect()` helper in `apps/web/src/lib/` rejects anything that isn't a same-origin relative path — an unvalidated `redirect` param is a textbook open-redirect vector the moment a page starts acting on it.
- Register's flow doesn't change beyond carrying the param: it still requires email verification before _that_ can happen, but login itself has no such gate (confirmed against `auth.service.ts` — `login()` never checks `emailVerifiedAt`), so a brand-new invitee can register, then log straight in and land back on the invite without waiting on the separate verification email.
- A fourth visitor state, added after first review: **wrong account** — signed in, but as someone whose email doesn't match who the invite was sent to (`acceptInvite`'s only 403 case). Rather than a dead-end generic error, this offers a one-click "log out and try again" that signs the visitor out and sends them back through `/login?redirect=...` with the same token, so they land right back here once they've signed in as the right person.

**Why it changed**

Milestone 13 flagged this as the more clearly-scoped of its two remaining frontend gaps, and it was actually blocking something live: the invite email has been linking to a 404 since Milestone 12 shipped `inviteMember()`. The redirect-survival design follows directly from `requireAuth()` being applied to _all_ organization routes including `/organizations/invites/accept` (see `organization.routes.ts`'s `router.use("/organizations", requireAuth())`) — there was no version of this feature that could skip the logged-out case.

**A verification note for this sandbox**

No backend files touched this milestone, so the API test suite is an unchanged baseline (ran green, same 64/64 as M13). `packages/types`/`validation`/`shared` rebuild clean; `apps/web`'s `tsc --noEmit` passes with no errors across the whole app (new and pre-existing files alike); `eslint` passes on every new/modified file. Same as Milestones 4, 8, and 13: `apps/web`'s `next build` itself couldn't be verified in this sandbox (no route to Google Fonts) — unrelated to this milestone's code, not attempted as a substitute for the typecheck/lint checks above.

**Remaining work (explicitly out of scope for M14)**

- No self-service "leave organization" action for a member — carried over from Milestone 13, still just an `ORG_ADMIN` revoking someone else.
- SSO — still not started.

**Next milestone**
To be scoped from here — candidates: SSO, or the Prisma-migrations gap from Milestone 11 if a real deploy is imminent.

## Milestone 15 — SSO (OIDC, SP-initiated, coexists with password login) ✅ (this delivery)

**Scope decisions, made explicitly before building**

- **OIDC only, not SAML.** Covers the large majority of current enterprise IdPs (Okta, Azure AD/Entra, Google Workspace, Auth0, OneLogin) with far less code and attack surface than SAML (no XML signing, no metadata/cert rotation). `OrganizationSsoConnection.protocol` is an enum specifically so SAML can slot in later behind the same shape, not a redesign.
- **SP-initiated only, not IdP-initiated.** The visitor starts at EMBR's own login page, not their IdP's app dashboard.
- **Coexists with password login, doesn't replace it.** Org admins opt in per-org; nothing is enforced. `OrganizationSsoConnection.enforced` exists in the schema (defaulted off, read nowhere) specifically so turning on enforcement later doesn't need another migration.

**What changed**

- New `OrganizationSsoConnection` model (one per organization, not a list — enterprise customers overwhelmingly standardize on a single IdP): issuer URL, client ID, AES-256-GCM-encrypted client secret, allowed email domain, `enabled`/`enforced` flags. Encrypted, not hashed, unlike `User.passwordHash` — the plaintext secret must be recoverable to present to the IdP's token endpoint on every login, which a one-way hash structurally can't support. New `sso.crypto.ts` handles this with a dedicated `SSO_ENCRYPTION_KEY` env var (base64, 32 bytes) — treat it with the same care as the JWT secrets; rotating it invalidates every stored connection's secret.
- `openid-client` v6 added as a dependency, wrapped in `sso.oidc.ts` rather than used directly elsewhere — isolates the third-party API shape from the rest of the app and gives tests a single, easy mock point.
- SP-initiated flow: `GET /auth/sso/start?email=...` looks up which org's connection (if any) governs that email's domain, builds a PKCE + state + nonce authorization request, stashes the verifier/nonce in Redis keyed by `state` (single-use, ~10 min TTL via `SSO_STATE_TTL_SECONDS`), and 302s to the IdP. `GET /auth/sso/callback` is the IdP's redirect target: validates state/PKCE/nonce, exchanges the code, and issues the same session cookies password login does (`issueSession` — now exported from `auth.service.ts` rather than staying a private helper, specifically so this could reuse it instead of duplicating session issuance).
  - Both routes are hit by full-page browser navigation, not `fetch()` — every outcome, success or failure, is a redirect (`/dashboard` or `/login?ssoError=...`), never a JSON error response. This is a deliberate departure from the rest of the API's JSON-everywhere convention, not an oversight.
  - The registered `redirect_uri` is `${APP_URL}/api/auth/sso/callback` — routed through the web app's own `/api/*` rewrite (see `apps/web/next.config.ts`) rather than the API's bare origin, so the callback's Set-Cookie response lands as an ordinary first-party cookie, identical treatment to every other auth endpoint. Because the actual request arrives at the API after that proxy hop, `sso.routes.ts` reconstructs the exact callback URL from `APP_URL` rather than trusting `req.originalUrl`/`req.get("host")`, which would reflect the internal hop instead.
- JIT provisioning on first SSO login: creates the `User` if none exists by that email (with a random, never-presented password hash — this account has no password login path unless the person separately completes forgot-password later; see remaining work), upgrades `emailVerifiedAt` if unset (the IdP vouching for the identity is at least as strong evidence as our own unclicked verification link), and auto-joins the organization as `ORG_MEMBER` if not already a member. Domain-gated: an identity outside the connection's `allowedEmailDomain` is rejected even though the visitor typed a matching-domain email to get there — the IdP's actual assertion is what's checked, not what was requested.
- Org-admin config: `GET`/`PUT /organizations/:organizationId/sso`, `ORG_ADMIN`-gated the same way the rest of the organization routes are. Full-replace `PUT`, not partial — the client secret is always required, even when only flipping `enabled`, since `GET` never echoes it back (`hasClientSecret: boolean` is all the response includes). `PUT` verifies the issuer's OIDC discovery document is reachable before saving, so a typo'd issuer URL fails at config time instead of silently breaking every login attempt through it.
- Frontend: login page gets a "Continue with SSO" button (reuses whichever email is already typed in the password form above it, rather than a second input) and an `ssoError`-driven banner for the redirect-back failure cases. Org console gets a new "Single sign-on" section alongside the existing roster/invite/trends sections.
- `docs/openapi.yaml` updated for all three new routes plus `SsoConnectionDto`, matching the M12-follow-up precedent of keeping the spec in sync rather than letting it drift.

**Why the design decisions above**

- Random-unusable-password-hash over making `User.passwordHash` nullable: the nullable-schema version is arguably the "more correct" long-term shape, but it ripples into `changePassword`'s current-password check, `auth.mappers.ts`, and every other place that assumes a hash exists. The random-hash version is a well-established real-world pattern for SSO-provisioned accounts and has zero blast radius on existing auth code. Flagged explicitly below as a known, accepted gap rather than something quietly worked around.
- `issueSession` exported rather than duplicated: a second, slightly-different implementation of session issuance is exactly the kind of thing that quietly drifts (cookie flags, JWT claims, refresh-token hashing) between the password and SSO paths over time. One implementation, two callers.
- Domain-gate re-checked at the callback, not just trusted from `/auth/sso/start`'s initial lookup: `/auth/sso/start` only decides which IdP to send the visitor to based on what they typed; it's the callback's job to verify what the IdP actually asserts, since an IdP can authenticate the visitor as a different account than the one implied by the email they originally entered (e.g., picking a different Google account at the consent screen).

**A verification note for this sandbox**

Full monorepo `pnpm typecheck`: 11/12 packages clean; `@embr/api` fails only on the confirmed, pre-existing Prisma-generation sandbox gap (`binaries.prisma.sh` unreachable — same constraint flagged since Milestone 2/11/12 and reconfirmed in the repo-maintenance fix between M12 and M13) — `sso.mappers.ts` shows the identical expected error pattern, nothing new. Full monorepo `pnpm lint`: all 12 packages clean. `apps/api` test suite: 82/82 passing (up from 64 at Milestone 14 — 18 new tests: 14 in `sso.test.ts` covering the config routes and the full start→callback flow with `openid-client` and Redis mocked, 4 in `sso-crypto.test.ts` unit-testing the encryption round-trip, tamper-rejection, and malformed-input handling directly). `apps/web` typecheck and eslint clean. `next build` itself remains unverifiable in this sandbox (no route to Google Fonts) — same unrelated constraint as every prior milestone touching `apps/web`.

**Remaining work (explicitly out of scope for M15)**

- SAML, IdP-initiated flow, SCIM provisioning/deprovisioning, multiple connections per organization, and enforce-only mode are all out of scope by design (see the scope decisions above) — not gaps, deliberate boundaries.
- An SSO-JIT-provisioned user's random password hash means they could still separately complete forgot-password and gain a working password login alongside SSO. Not a security hole (the reset link still only reaches someone who controls the email inbox) but a product nuance worth a decision later: is a dual login path fine, or should JIT-provisioned accounts have password-login explicitly blocked?
- `sso.oidc.ts`'s discovery call isn't cached — every login (and every config save) does a fresh round-trip to the IdP's `.well-known/openid-configuration`. Fine for a first cut at realistic pilot-customer volumes; worth a short-TTL per-connection cache if it ever shows up in latency numbers.
- No self-service "leave organization" action — carried over from Milestone 13/14, still open.

**Next milestone**
To be scoped from here — candidates: closing the forgot-password-on-SSO-account nuance above, the Prisma-migrations gap from Milestone 11 if a real deploy is imminent, or a genuinely new area (SAML, self-service org-leave, something else) depending on what a real pilot customer surfaces first.

## Repo maintenance — fixed a broken merge on `main` (post-Milestone 15)

Found while investigating unrelated work: `main` had two live merge-conflict artifacts from the SSO branch (#43) landing alongside other in-flight work, neither caught by CI apparently because `pnpm install` still succeeded locally against an already-resolved `node_modules` in whatever ran it last —

- `apps/api/src/modules/auth/audit.ts`: the `AuditAction` type was terminated with a semicolon mid-union, leaving several members (including this branch's own `SSO_*` actions) as orphaned, invalid syntax after it. This was a hard parse error — `eslint` and `tsc` both failed outright on the file, and the majority of `apps/api`'s test files failed as a result (anything importing audit.ts transitively). Fixed by merging into one clean union with no duplicates.
- `apps/api/package.json`: a duplicate `nodemailer` dependency key — `^9.0.3` (a legitimate, already-completed bump found in this file's own history) sitting alongside a stale `^6.9.16` left over from the SSO branch's base. This corrupted `pnpm-lock.yaml` with a duplicate YAML mapping key, which made `pnpm install --frozen-lockfile` fail outright — i.e., a fresh clone or CI run of `pnpm install` was currently broken on `main`. Fixed by removing the stale line and fully regenerating the lockfile (a large diff, mostly cosmetic re-quoting from the regeneration — verified only ~32 real transitive version lines actually changed, all plausible drift).

Also added two indexes prompted by an external review: `AuditLog(createdAt)` (time-range queries) and `Session(expiresAt)` (useful the moment any session-cleanup mechanism exists — none does yet). Schema-only, no behavior change.

**Verification**: full monorepo `pnpm typecheck` (13/13 expected errors, all the confirmed Prisma-generation sandbox gap — see prior entries — spread across a couple more files now that other work has landed, nothing new), full monorepo `pnpm lint` (12/12 clean), `apps/api` test suite (106/111 passing, 5 skipped, 2 failing — both `test/integration/*` files that deliberately require a real Redis instance to exercise the production rate-limit store end-to-end, which this sandbox doesn't have; confirmed via `redis-cli`/`redis-server` both absent).

## Backend fix — mobile-viable auth (refresh + logout), ahead of Milestone 16

Found while scoping a mobile app: `AuthSessionResponse.accessToken` was explicitly documented as existing "for non-browser clients (mobile)... that can't rely on httpOnly cookies," but that was only ever true for login — `/auth/refresh` and `/auth/logout` still read the refresh token exclusively from the `embr_rt` cookie and required a cookie-only CSRF header, with no fallback. Given `ACCESS_TOKEN_TTL_SECONDS` defaults to 15 minutes, a mobile client built against the API as it stood would have been silently logged out every 15 minutes with no way to refresh or to log out cleanly server-side — not a usable foundation to scaffold a real app on top of.

**What changed**

- `/auth/login`'s response body now includes `refreshToken` alongside `accessToken` (mirroring the existing accessToken-for-mobile pattern exactly — browser clients still rely on the cookie and ignore both fields).
- `/auth/refresh` and `/auth/logout` now accept the refresh token via `refreshToken` in the request body as a fallback when no `embr_rt` cookie is present, and the rotated refresh token is included in `/auth/refresh`'s response body — a mobile client that only kept `accessToken` would successfully refresh exactly once and then be permanently stuck.
- `requireCsrfToken()` now takes the name of whichever cookie this route's credential would arrive in if cookie-authenticated (`ACCESS_TOKEN_COOKIE` by default for `requireAuth()`-gated routes, `REFRESH_TOKEN_COOKIE` explicitly for `/auth/refresh`/`/auth/logout`) and skips the check entirely when that cookie is absent. This isn't a weakening: CSRF specifically exploits a browser _automatically_ attaching an ambient cookie to a forged cross-site request — a mobile client presenting its token explicitly via header or body isn't vulnerable to that in the first place, and previously had no CSRF cookie to present at all, meaning it couldn't reach these endpoints regardless of how it authenticated.
- `GET /auth/me` and `/auth/logout-all` needed no changes — `requireAuth()` already accepted a Bearer `Authorization` header as a documented fallback; this was already mobile-ready, just never exercised by anything.

**Verification**: added explicit test coverage rather than just trusting the change — 6 new tests in `auth.test.ts` covering login's body shape, `/auth/me` via Bearer-only (no cookies), `/auth/refresh` and `/auth/logout` via body-only (no cookie, no CSRF header), rotation-then-replay-rejection on the body path (same as the existing cookie-path test), and — the one that actually matters most — an explicit check that a genuinely cookie-authenticated request with a missing CSRF header is _still_ rejected exactly as before, confirming the exemption didn't accidentally weaken the browser path. All 18 tests in the file pass (12 existing + 6 new), full suite 136/141 (5 skipped, 2 failing on the same real-Redis sandbox limitation as always), full monorepo typecheck/lint at the established baseline.

**Remaining gap, explicitly not solved here**: token storage/rotation on the client side (secure storage, refresh-on-401 interceptor logic) is a mobile-app-side concern, addressed in Milestone 16 below, not a backend one.

## Milestone 16 — Mobile app scaffold (Expo / React Native)

New `apps/mobile` workspace: a real Expo SDK 57 (React Native 0.86) app, wired end-to-end against the actual API — not a placeholder shell.

**What changed**

- `apps/mobile`, added to the pnpm workspace, depending on `@embr/types` and `@embr/validation` like every other app.
- File-based routing via `expo-router`: `app/_layout.tsx` (root, wraps `AuthProvider`), `app/index.tsx` (redirects to `/login` or `/(app)` based on auth state), `app/login.tsx`, `app/register.tsx`, and an `(app)` route group whose own `_layout.tsx` guards against unauthenticated access — same shape as `apps/web`'s dashboard guard, adapted to Expo Router's group convention.
- `lib/token-storage.ts`: `expo-secure-store` (Keychain/Keystore-backed) wrapper for the access/refresh token pair — always read and written together, so a partial write can't leave a stale access token paired with an already-rotated-away refresh token.
- `lib/api-client.ts`: no same-origin proxy to hide behind like `apps/web`/`apps/admin` have (see their `next.config.ts` rewrites) — this calls the API directly over `EXPO_PUBLIC_API_URL`, attaches `Authorization: Bearer <token>`, and transparently refreshes on a 401 (deduplicated across concurrent in-flight requests, since refresh tokens rotate on use and a second concurrent presentation of the same one would fail even though the first succeeded) before retrying the original request once.
- `lib/auth-context.tsx` / `lib/api.ts`: same shape as `apps/web`'s equivalents, adapted for explicit token persistence instead of an implicit cookie jar.

**Why this was buildable at all right now**

The backend fix directly above this entry ("mobile-viable auth") is what made this a real scaffold instead of a dead end — before that, `/auth/refresh` and `/auth/logout` had no non-cookie path, so a mobile client would've been silently logged out every `ACCESS_TOKEN_TTL_SECONDS` (15 minutes default) with no way back in. This milestone is the client-side half of that same effort.

**Verification**

- Full monorepo `pnpm typecheck`: 12/13 packages clean, including `@embr/mobile` itself. The 13th, `@embr/api`, fails only on the confirmed, pre-existing Prisma-generation sandbox gap — including two implicit-`any` errors in `organization.routes.ts` that look unrelated at first glance but are the same root cause surfacing differently (that file's `prisma.organization.findMany(...)` call has no real return type to infer from when the generated client can't resolve, so the `.map()` callback's parameters go from precisely-typed to implicit-`any`); `main`'s real CI already has this file typechecking clean with a working Prisma client.
- Full monorepo `pnpm lint`: 13/13 clean.
- `expo export --platform web` (with `EXPO_OFFLINE=1`, since the Expo CLI's own dependency-compatibility check calls `api.expo.dev`, which this sandbox can't reach) produced a complete, successful Metro bundle — 1302 modules, every route compiled, real cross-package resolution of `@embr/types`/`@embr/validation` confirmed working end-to-end. Stronger verification than typecheck alone: this is proof the app actually builds, not just that the types line up.
- Could not verify: an actual native build or a real device/simulator run (no Xcode/Android SDK in this sandbox), and `npx expo install`'s own compatibility resolution (same blocked `api.expo.dev` host) — dependency versions were instead pinned by hand against the real npm registry, cross-checked against what SDK 57's own install guide specifies.

**Remaining work (explicitly out of scope for this milestone)**

- Symptom logging is now built (see follow-up commit below) — cycle tracking and trends are still to come.
- `GET /auth/sessions`'s "is this the current device" marking relies on reading the refresh token cookie server-side — mobile has no cookie, so that field just won't distinguish "this device" from any other session in a future sessions-list screen. Minor UX nuance, not a blocker; noted here rather than silently left for someone to puzzle over later.
- `expo-modules-core`'s declared peer range for `react-native-worklets` (`^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`) hasn't caught up to the `0.11.3` that `react-native-reanimated` (pulled in transitively by `expo-router`'s own drawer-navigation dependency, not something this app uses directly) actually needs — a soft peer-dependency warning, not an install or build failure; very plausibly just SDK 57 being three weeks old at time of writing and the ecosystem not fully caught up yet. Worth a glance next time dependencies are touched, not worth forcing an override now.
- No test framework wired up yet (no `test` script) — deferred rather than reaching for `jest-expo` just to have something, given there's not much product logic yet to test in isolation from the UI.
- Backend decision explicitly deferred by design (per how this milestone was scoped): whether mobile gets its own dedicated API/BFF (push notifications, device tokens, etc.) or continues sharing `apps/api` directly, as it does today.

**Follow-up in this same milestone: symptom logging**

The first real product screen past auth. `app/(app)/index.tsx` now does the actual job: a category picker (chip grid over `symptomCategorySchema.options` — the real Zod enum's runtime values, not a hand-duplicated list that could drift from the backend's), a severity picker the same way, an optional notes field, and a recent-logs list with optimistic delete (removed from the list immediately, restored via a re-fetch if the server call actually fails, rather than leaving the UI showing something that silently isn't true server-side). `occurredAt` defaults to "now" — no date/time picker yet, logging in the moment is the primary case; picking a past time is a reasonable fast-follow, not done here.

Re-verified the same way: full monorepo typecheck and lint both stayed clean, and a fresh `expo export --platform web` produced a complete build (1304 modules, up from 1302).

**Second follow-up: cycle tracking, and real tab navigation**

`app/(app)/cycle.tsx` mirrors `apps/web`'s "today's cycle entry" quick-log (flow picker over `flowIntensitySchema.options`, period-start/end switches, notes) against the same upsert-by-date endpoint — `date` is the entry's identity (one per user per calendar day), so saving again for today updates rather than duplicates, same as web.

With two real screens now, replaced the bare `Stack` in `(app)/_layout.tsx` with a proper `Tabs` navigator (Symptoms / Cycle) — the idiomatic `expo-router` pattern for a main app area, not more work than a single link would have been.

Re-verified again: typecheck and lint both clean, `expo export --platform web` complete (1305 modules).

**Third follow-up: trends**

`app/(app)/trends.tsx` mirrors `apps/web`'s trends view: symptom frequency as horizontal bars over the last 90 days, cycle length between period starts over the last 180 days, both computed server-side (Milestone 9) so neither is subject to any client-side page cap. Kept web's deliberate tone intact rather than reworded it away — the empty-state copy for cycle length says outright that irregular or absent cycles are common in perimenopause and this is a record, not a diagnosis, and the footnote below the data repeats that framing. That wording exists on purpose; a health-tracking view for this population needs to avoid reading as a judgment on what it's showing, and that's exactly the kind of thing that's easy to accidentally lose when porting a screen to a new platform.

Added as a third tab. Re-verified the same way as every prior mobile commit: full monorepo typecheck and lint both clean, `expo export --platform web` complete (1306 modules, up from 1305).

**Next milestone**
To be scoped from here — auth, symptom logging, cycle tracking, and trends are all now built and working against the real API. Most likely candidates: a date/time picker for backdating a symptom log or cycle entry, account settings (change password, sessions — `apps/web`'s equivalent already exists to mirror), or the mobile-specific backend decision flagged above if push notifications become a near-term need.

## Repo maintenance — reconciling two parallel mobile-app builds

Two independent builds of the mobile app existed in parallel — this session's own scaffold (`milestone-16-mobile-scaffold`, auth flow only, built around the shared `@embr/sdk` package with test coverage for its trickiest part) and a separate `feature/mobile-app` branch (further along: a real symptom-logging screen, actual icon/splash assets, its own mobile-local `api-client.ts`). Both independently converged on the same correct design for silent-refresh-on-401 with concurrent-request deduplication — reassuring on correctness, but genuine duplicate work either way. Decision: keep `feature/mobile-app` as the base (more product value delivered, real assets); this session's own scaffold was discarded rather than merged.

**What was added on top of their branch, found getting it to a clean state**

- `apps/mobile` had no ESLint config of its own at all — not even `eslint-config-expo` as a dependency — so `"lint": "eslint ."` had been silently falling back to the bare root config. Added the same `eslint.config.mjs` pattern already proven for `apps/web`/`apps/admin` (explicit `/flat.js` path — `eslint-config-expo` ships both a `flat.js` file and a same-named `flat/` directory at its root, and Node's ESM resolver finds the directory first without the extension).
- Their `tsconfig.json` had no explicit `include`, which meant TypeScript's default (include everything under the project root) swept the newly-added `eslint.config.mjs` into the app's own type-checking scope, producing spurious "missing type declarations" errors for config-only packages. Added the same explicit `include`/`exclude` used elsewhere in the monorepo.
- The `react-hooks/set-state-in-effect` sweep across `apps/web`/`apps/admin` and the `lint-staged` CWD-resolution structural fix (see the "Milestone 16" entry above, on the now-discarded scaffold branch) were re-applied here, since they're valid regardless of which mobile app won and had never actually reached `main`.

**Verification**: full monorepo `pnpm typecheck` (12/13 — the one failure is the confirmed pre-existing Prisma-generation sandbox gap), full monorepo `pnpm lint` (13/13, clean), full `apps/api` suite (136/141, same 2 real-Redis-dependent integration tests as always in this sandbox).

## Repo maintenance — merged two independent quality PRs

Both found already on `main`'s branch list, both high-quality and non-conflicting with anything else — merged directly rather than left queued.

**`issue-28-index-review-fix` (#28)** — investigated whether the org-level symptom-frequency aggregate (`symptomFrequencyForMembers`) needs additional indexes, with actual empirical methodology rather than speculation: seeded a local Postgres with 8.7M `symptom_logs` rows across 50k users, ran `EXPLAIN (ANALYZE, BUFFERS)` against a realistic 500-member cohort. Finding: the existing `symptom_logs (userId, occurredAt)` index is already correct for the common (date-bounded) case; the unbounded "all-time" case is genuinely slow at that scale, but forcing the existing index made it _slower_, not faster — 500 essentially-random user IDs out of 50k don't cluster in index order, so this is a data-distribution problem no index fixes. Conclusion: no schema change, comment-only diff documenting the finding directly next to the query, specifically so it isn't re-litigated speculatively without re-running the analysis.

**`chore/sso-oidc-coverage-and-test-hygiene`** — two things: (1) direct unit test coverage for `sso.oidc.ts` (12 new tests, mocking `openid-client` itself rather than the wrapper) — including verifying the SSRF guard is actually wired into the discovery call, closing a coverage gap Milestone 15 knowingly left; (2) a real fix for the two Redis-dependent integration tests that had been failing in this sandbox (and presumably any environment without Redis) every single run this whole document's history — a new `isRedisReachable()` raw-TCP-probe helper, checked _before_ importing the real `ioredis` client (which connects eagerly at import time), gating both files with `describe.skipIf`. Confirmed: `apps/api` test suite now reports 17/17 test files passing with 2 cleanly _skipped_ (not failed) — the first time in this document's history that command hasn't required an explanatory caveat about Redis.

**Verification**: full monorepo `pnpm typecheck` (12/13, confirmed pre-existing Prisma-generation sandbox gap), `pnpm lint` (13/13, clean), `apps/api` full suite: 148/148 passing, 5 skipped (unrelated, pre-existing conditional skips), the 2 Redis-integration files now skip cleanly instead of failing.

## Mobile: account settings (change password, device sessions, log out everywhere)

Mirrors `apps/web`'s `/settings` page — the one piece of the auth surface mobile didn't have yet. Reuses the same `changePasswordSchema` validation and `DeviceSessionDto` shape; no backend changes needed since `requireCsrfToken()`'s cookie-presence check (see the earlier "mobile-viable auth" entry) already makes `/auth/change-password`, `/auth/sessions`, and `/auth/logout-all` work correctly for Bearer-authenticated requests with no further work.

Added as a 4th tab. The existing quick "Log out" link on the Symptoms screen stays where it is — this is additive, not a replacement.

**Verification**: `apps/mobile` typecheck and eslint both clean; full monorepo typecheck 12/13 (confirmed Prisma-generation sandbox gap), lint 13/13.

## Milestone 17 — EMBR BRIEF, backend (AI-generated GP visit prep, saved & re-downloadable)

**Why this, now**: three separate product documents in the team's Drive all independently converge on the same point — EMBR BRIEF is "the beachhead," "highest clinical value," "the single feature with the clearest aha moment," and infrastructure (auth, sync, mobile shell) is "necessary but is not the product." Scoped collaboratively before building: ships on both web and mobile, AI both summarizes patterns _and_ suggests GP discussion topics (not a pure-structured v1), and generated briefs are saved with a re-downloadable history — all three explicit product decisions, not assumed.

**What changed**

- New `ClinicalBrief` model: a **point-in-time snapshot**, not a live view — stores the structured summary (symptom frequency + severity breakdown, cycle length trend) _and_ the AI-generated narrative/discussion-topics together, so re-downloading a brief a year later reproduces exactly what was generated even if the underlying logs have since been edited.
- `brief.ai.ts` — the safety-critical piece, given EMBR's explicit "not a diagnostic tool, no medical advice" positioning (see README.md). The system prompt is deliberately narrow: describe only patterns the structured data actually supports, never diagnose or recommend treatment, and — since the person chose "summarize + suggest discussion topics" over a pure-narrative version — every discussion topic must be phrased as a question the person could ask their own GP ("ask whether X is typical"), never as an assertion or recommendation, which is what keeps "discussion topics" from quietly becoming a rule-2 violation under a different name. Only the structured, aggregated summary is ever sent to the model — never raw free-text symptom-log notes, both as privacy minimization and to keep the model's input (and therefore its output) tightly scoped to what this feature is for. Response is JSON-parsed and zod-validated, not trusted blindly; a malformed model response is a thrown error, not a silently-corrupted brief.
- Routes: `POST /briefs` (generate), `GET /briefs` (paginated history, list view omits AI content to keep it light), `GET /briefs/:id` (full content), `GET /briefs/:id/pdf` (rendered from the stored snapshot — never re-queries live data or re-calls the AI), `DELETE /briefs/:id`. Access control scoped in the query itself (`findFirst({ where: { id, userId } })`) — another user's brief 404s rather than 403ing, matching the SSO-connection pattern's reasoning: don't confirm existence.
- `brief.pdf.ts` extends the existing `export/pdf.ts` clinician-summary builder — reused `cycleLengths`/`categoryLabel` rather than reimplementing (exported both for that purpose), consistent with the DRY precedent `issue-25-org-repo-dedup` set earlier.
- Model pinned explicitly (`ANTHROPIC_BRIEF_MODEL`, defaults to `claude-sonnet-5`) rather than left to resolve against "latest" — a clinical-adjacent feature's tone/shape changing silently on a provider-side model swap is worse than this needing a deliberate version bump later. Sonnet-tier: this task doesn't need Opus-level reasoning, and Haiku is a worse fit for a tone-sensitive, safety-sensitive task.

**Verification**: 17 new tests — 7 unit tests on `brief.ai.ts`'s response parsing/validation (malformed JSON, missing fields, empty topics array, no text block all correctly rejected; confirmed via direct assertion on the mocked call that raw notes never appear anywhere in what's sent to the model, and that the system prompt actually contains the safety-rule language) and 10 on the routes (computation correctness — symptom counts/severity breakdown and cycle-length averaging checked against known fixture data, not just "did it return 200" — plus real access-control tests: another user's brief 404s on GET and on DELETE, and DELETE-for-a-non-owned-id verified to not actually delete anything). Full monorepo typecheck 12/13 (confirmed pre-existing Prisma-generation sandbox gap, nothing new), lint 13/13, full `apps/api` suite 165/165 passing (up from 148), 2 cleanly skipped.

**Remaining work (explicitly out of scope for this delivery)**

- Both frontends (web page, mobile screen) — backend-only so far, next immediately.
- No rate limiting specific to brief generation (each call is a real Anthropic API spend) — worth a limiter before this is live for real users, same pattern as `loginLimiter`/`refreshLimiter`.
- No way to regenerate a brief with corrected data without creating a whole new one — acceptable for v1 given briefs are meant to be point-in-time snapshots anyway.

**Next**: both frontends, then the rate-limit gap above before this goes live for real.

## EMBR BRIEF: mobile frontend

Completes the "ships on both web and mobile simultaneously" decision from Milestone 17's scoping. Same generate/history/view/delete flow as the web page, adapted for two mobile-specific realities:

- No native date picker in this app yet (nothing elsewhere uses one — `cycle.tsx` only ever logs "today"), so date range entry is plain `YYYY-MM-DD` text input with client-side format validation, matching this app's established preference for simplicity over adding a new native dependency for one screen.
- No browser download mechanism and no cookie to authenticate a plain link with (unlike web's `<a href="/api/briefs/:id/pdf">`) — `brief-pdf.ts` fetches the PDF with an explicit Bearer header via `expo-file-system`'s current `File.downloadFileAsync(url, dir, { headers })` API (confirmed against the actual SDK 57 docs/changelog before writing this, not assumed from older `FileSystem.downloadAsync` memory — the file-system API was substantially rewritten in SDK 54, and the two are not interchangeable), then hands the local file to `expo-sharing`'s native share sheet so the person can actually save or send it somewhere.

New dependencies: `expo-file-system` and `expo-sharing`, both pinned to their real current registry versions.

**Verification**: `apps/mobile` typecheck and eslint both clean on the first pass (including the new `File`/`Directory`/`Paths`-based download helper, which validates the SDK-57-current API usage was correct). Full monorepo typecheck 12/13 (confirmed Prisma-generation sandbox gap), lint 13/13.

EMBR BRIEF now ships as designed: generate on either platform, saved with a re-downloadable history on either platform.

## EMBR BRIEF: generation rate limit (cost control)

The one gap explicitly flagged as needed before launch, closed now rather than left open: `POST /briefs` had no rate limit, and every call is a real Anthropic API spend. Unlike `auth/rate-limiters.ts`'s limiters (anti-brute-force, keyed by IP or email+IP on _unauthenticated_ endpoints), this one is pure cost control on an already-`requireAuth()`-gated endpoint — keyed by user ID, not IP. 10/hour, well above any real GP-prep use case, caps the blast radius of a client bug or an account generating far more than anyone would organically need.

No new tests — this follows the exact same `skipInTest()` pattern the auth limiters already established (a no-op during the test suite; actual rate-limiting behavior is covered by the real-Redis integration tests, not the unit suite). Verified the brief test suite is unaffected: still 17/17.

## Milestone 18 — Treatment tracking (backend)

New `Treatment` model and full CRUD API — the "what was being done" layer that symptom/cycle logs alone don't capture (started X on date Y, stopped on date Z). Backend-only, matching the precedent Milestone 12 set: ship the data model and API, scope the frontend as its own follow-up rather than guess at the UI alongside the schema.

**What changed**

- `Treatment` model: `name`, `category` (`HRT` / `SUPPLEMENT` / `MEDICATION` / `LIFESTYLE` / `OTHER`), `startDate`, `endDate` (nullable — null means ongoing/current, same open-ended pattern as `OrganizationInvite.consumedAt`), `notes`. Deliberately no separate "outcome" model: correlating a treatment's date range against the existing `SymptomLog`/`CycleEntry` history already covers "what changed afterward" without a new table to keep in sync.
- Full module (`apps/api/src/modules/treatments`) mirroring `symptoms`'s exact shape: `POST /treatments`, `GET /treatments` (paginated, filterable by `category` and `active` — "currently on" computed as `startDate <= today AND (endDate IS NULL OR endDate >= today)`, since that's the query a treatment list actually wants most of the time, not a raw date-range filter), `GET /treatments/:id`, `PATCH /treatments/:id`, `DELETE /treatments/:id`. Same ownership-scoping precedent as every other personal-data module: another user's treatment id 404s, never 403s.
- `endDate >= startDate` is enforced two ways: the Zod schema's own `.refine()` catches a request supplying both fields inconsistently; a service-layer check (fetching the existing record) catches a partial update touching only one of the two fields, which the schema alone can't validate since the other value isn't in that request body at all.
- 14 new tests, full suite 179/179 (up from 165), 5 skipped (the pre-existing conditional Redis-integration skips, unrelated).

**Why now**

Prompted by an outside strategic read on the repo that argued (among a lot of speculative, unverified business-strategy content not treated as settled fact here) that treatment/outcome data is what turns a symptom diary into something with real longitudinal value — for the person using it, and eventually for whatever a clinician-facing view (EMBR BRIEF, already shipped) does with it. That specific point held up on its own merits independent of the surrounding pitch, and was a clean, well-scoped, immediately buildable gap regardless of where the larger strategic conversation lands.

**Remaining work**

- No frontend yet — neither `apps/web` nor `apps/mobile` have a treatments screen. Natural next step, following the same pattern symptom logging and cycle tracking already used on mobile.
- EMBR BRIEF doesn't reference treatment data yet — a brief that could say "started HRT on this date, sleep disruption changed over the following N days" would be substantially more useful than symptoms/cycles alone. Deliberately not touched here: `brief.ai.ts` is a careful, safety-scoped module (data-grounded only, never diagnosis/treatment recommendations) that shouldn't be extended by someone who didn't write its constraints, without at least a conversation about how "what treatment was the patient on" should be represented to the model without drifting toward the AI making treatment-efficacy claims it's explicitly designed not to make.
- No correlation/analytics endpoint (e.g. "symptom frequency before vs. after this treatment's start date") — noted as a possible dedicated `trends`-style endpoint if that turns out to be worth building, not assumed necessary yet.

**Next milestone**
To be scoped from here — most likely candidates: treatment tracking UI on `apps/mobile` (and/or `apps/web`), or wiring treatment data into EMBR BRIEF's context (with real care given that module's existing safety constraints).

## Milestone 19 — Org billing (Stripe, seat-based subscriptions)

The billing/seat-purchase gap flagged since Milestone 12: `seatLimit` existed and was enforced on invite, but nothing set it except manual ops provisioning. Closes that with a real Stripe integration.

**What changed**

- `Organization` gains four billing fields (`stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `currentPeriodEnd`) and a `StripeSubscriptionStatus` enum mirroring Stripe's own subscription statuses 1:1. New `StripeWebhookEvent` table is a pure idempotency ledger (Stripe's delivery guarantee is at-least-once, not exactly-once).
- `modules/billing`: `POST /organizations/:organizationId/billing/checkout-session` (creates or reuses a Stripe Customer, then a Checkout Session for a seat-quantity subscription), `POST .../billing/portal-session` (Stripe Billing Portal — seat changes, payment method, invoices, all Stripe-hosted), `GET .../billing` (status: subscription state, seat usage, `billingEnabled`). All three ORG_ADMIN-gated, same visibility boundary as SSO config and the member roster.
- **The integration point with Milestone 12's existing enforcement is deliberately minimal**: a subscription webhook sets `Organization.seatLimit` directly to the subscription's item quantity. `organizationService.inviteMember`'s seat-limit check (Milestone 12) needed zero changes — it was already written to treat `seatLimit` as "whatever the real number is," and billing is now just one more way that number gets set, alongside manual ops provisioning, which still works unchanged.
- `POST /billing/webhook`: raw-body, signature-verified (`stripe.webhooks.constructEvent`), unauthenticated by design (the signature _is_ the auth). Mounted in `app.ts` with its own `express.raw()` parser positioned before the app-wide `express.json()` — the one place in this codebase two different body-parsing strategies coexist, and the ordering is load-bearing (see the comment at that mount point). Handles `customer.subscription.created/updated/deleted` only — deliberately not `checkout.session.completed`, since the subscription-lifecycle events are Stripe's own recommended source of truth and cover the full lifecycle on their own. Every other event type is acknowledged (200) and ignored.
- Cancellation (`customer.subscription.deleted`) sets `subscriptionStatus: CANCELED` and **deliberately leaves `seatLimit` untouched** — a canceled subscription doesn't retroactively evict existing members; whether it should block new invites going forward is exactly what `subscriptionStatus` is for.
- All three `STRIPE_*` env vars are optional (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SEAT_PRICE_ID`) — every billing route checks `isBillingConfigured()` first and returns a clean 503 rather than the API failing to boot in every environment that hasn't set this up (matches `SENTRY_DSN`'s existing optional-feature precedent).
- Rate-limited checkout-session creation (20/hour, user-keyed) — same cost-control reasoning as `brief-rate-limiter.ts`, not anti-brute-force, since every call is a real Stripe API round-trip.

**Verification**

Full monorepo `pnpm typecheck`: 12/13 clean — the one failure is the confirmed, pre-existing Prisma-generation sandbox gap (same root cause across every file it touches, including the new `billing.mappers.ts`/`billing.repository.ts`/`billing.webhook.ts`, plus the already-documented `admin.service.ts` implicit-`any`); no new error introduced by this milestone. `pnpm lint`: clean. New test file (`billing.test.ts`) covers ORG_ADMIN-only access (403 for a member, 404 cross-org), checkout-session customer create-then-reuse, portal-session's 409-without-a-customer guard, the not-configured 503 path, webhook signature rejection, and `processWebhookEvent`'s idempotency + all three subscription event types via a mocked `stripe` SDK (same precedent as `brief.ai.test.ts` mocking `@anthropic-ai/sdk`) — **could not be executed in this sandbox**: every test file, including pre-existing ones untouched by this change (confirmed against `organization.test.ts`), fails at import with an `@opentelemetry/core` ESM/CJS interop error coming from `@sentry/node`. Root cause: this sandbox runs Node v22.22.2 against a repo pinned to v20.11.0 (`.nvmrc`) — a sandbox/environment mismatch, not a regression from this change. Needs a real CI run (or a sandboxed Node 20) to confirm the new suite actually passes, the same caveat every Prisma-touching milestone in this document already carries for a different reason.

**Remaining work**

- No proration/upgrade-path decision beyond what Stripe's Billing Portal already handles by default — fine for a first cut, worth a deliberate look once a real customer actually changes seat count mid-cycle.
- No `apps/web`/`apps/admin` billing settings screen yet — backend-only, matching the precedent Milestone 12 and Milestone 18 both set (ship the API, scope the frontend as its own follow-up).
- `invoice.payment_failed` isn't handled separately — Stripe already reflects a failed-payment state through `customer.subscription.updated`'s `status` field (`past_due`), which this milestone does handle; a dedicated handler would only matter for something more specific (e.g. an email nudge) than state tracking.
- The Node-version test-runner gap above should be fixed (or worked around) before this ships, not treated as permanently acceptable — recorded here because it blocked real verification in this sandbox, not because it's fine to leave.

**Next milestone**
To be scoped from here — candidates: the billing settings UI, the self-service "leave organization" gap (still open since Milestone 13), or the SSO dual-login-path decision (still open since Milestone 15).

## Milestone 20 — Clinical Brief 2.0 (deterministic evidence, Stage 4 interpretation, AI safety and provenance, cross-brief trends)

Eleven commits (`c3686e4` through `f859f00`), recorded here as one milestone rather than eleven — each commit was a genuine implementation step, but none of them is a product milestone on its own; together they turn EMBR BRIEF (Milestone 17) from a single AI-narrated summary into a layered pipeline with a deterministic evidence base, a bounded interpretation layer between that evidence and the model, citation-checked AI output, and a longitudinal view across a person's brief history. The self-service "leave organization" feature committed alongside this work (`90d850f`) belongs to the organization roadmap, not this one, and is deliberately not covered here.

### 1. Deterministic evidence layer

Five independent, pure, unit-tested computations, all built directly on already-logged data with no AI involvement at any point:

- **Severity breakdown** — surfaced in web and mobile from the existing `severityBreakdown` aggregation, using `Intl.ListFormat` for locale-correct rendering (Japanese `、` vs. English `,`).
- **Period-over-period frequency comparison** (`period-comparison.ts`) — the requested period against the immediately preceding period of equal length; `percentageChange` is `null` rather than a fabricated number when the previous count was zero.
- **Symptom co-occurrence** (`trends/co-occurrence.ts`, wired into the brief) — the single strongest-overlap category pair within the period, reusing the existing detector unmodified rather than building a second implementation.
- **Persistent symptoms** (`persistent-symptoms.ts`) — a category counts as persistent only when it was reported at all in the previous period and remains at or above a floor in the current one; zero new counting, purely a filter over the frequency comparison already computed.
- **Treatment impact** (existing `treatment-impact.ts`, wired into the brief) — before/after symptom-log windows for treatments that _started_ inside the requested period specifically, not every treatment merely overlapping it.

Every one of these is a snapshot fact computed once at generation time and persisted with the brief — never recomputed on read, matching the point-in-time-snapshot invariant Milestone 17 established.

### 2. Stage 4 interpretation

`stage4-interpretation.ts` is the layer that decides which deterministic findings are worth narrating, so the AI is never handed raw evidence to interpret on its own. Exactly four pattern types — `frequency_increased`, `frequency_decreased`, `co_occurrence_detected`, `treatment_window_changed` — each with a deterministic `id` (built only from `type` and `evidenceRef`, never random, so the same evidence always produces the same identifier), fixed observation/interpretation/caveat template text, and a `confidence: "descriptive"` marker communicating the epistemic level of the output rather than a statistical score. The frequency thresholds were deliberately _not_ given an independent materiality floor beyond what `period-comparison.ts` already established — Stage 4 interprets qualified evidence, it doesn't redefine what qualifies. Every pattern's evidence reference is traceable back to the exact source that produced it.

### 3. AI safety and provenance

The core invariant: **the AI may describe a relationship only when it corresponds to a Stage 4 pattern that was actually supplied to it.** Established across several pieces working together, not one:

- **`stage4-ai-projection.ts`** — a privacy-safe projection between the canonical, UI/PDF-facing `Stage4Result` (which may legitimately contain a treatment's name) and what actually reaches the model. Found and closed a real gap during this work: `treatment_window_changed` patterns embed a treatment's name in their `observation` text for display purposes, which would otherwise have leaked into the AI's input the moment `interpretation` was added to `BriefInput` — the projection rebuilds that one field from structured before/after counts instead, never by parsing or redacting the canonical string, and never by altering the canonical result itself.
- **`stage4-validation.ts`** — after the AI responds, every pattern it echoes back is checked against the canonical, server-side interpretation by `id`, `type`, and `evidenceRef`. A returned subset is expected and valid (the model isn't required to narrate every pattern it was given); an altered or invented one fails the whole generation closed via `AppError.internal`, before persistence.
- **`brief.ai.ts`'s response contract** — extended to require `patterns: Stage4Pattern[]` alongside the existing `narrative`/`discussionTopics`, validated by Zod against the same discriminated `evidenceRef` shapes Stage 4 itself defines (imported from `@embr/types`, not duplicated). The existing content-safety deny-list (diagnosis language, directive treatment language, dosage-shaped figures) now scans pattern text too, not just narrative and discussion topics.
- **Discussion-topic citation hardening** (the final commit, `865e862`) — closed the one remaining gap in this chain: discussion topics could previously assert a relationship in question form with nothing structurally checking it, relying on a system-prompt instruction alone. The wire format for each topic is now `{text, patternIds}`; any cited id must resolve to a pattern the model also echoed in that same response's `patterns` array, or the whole response fails closed. `patternIds` is stripped after validation — `BriefContent.discussionTopics` remains plain `string[]` to every caller, so nothing downstream needed to change.

An explicit, deliberate limitation, not an oversight: citation validation proves a legitimate evidence source was available. It does not, and cannot, prove the AI's prose is a faithful restatement of that evidence — a model could cite a real pattern and still overstate it in the narrative. The deny-list is the (partial) backstop for that specific residual risk, not a complete solution to it.

### 4. Persistence

`ClinicalBrief` gained six additive, nullable JSON columns across six migrations (`frequencyComparison`, `coOccurrence`, `treatmentImpact`, `persistentSymptoms`, `interpretation`, `citedPatternIds`) — never a schema change to an existing column, so every brief generated before a given field existed remains fully readable, reading back `null` rather than a backfilled or recomputed value. The canonical `interpretation` is computed exactly once per generation (`buildStage4Interpretation`, called a single time, verified directly by a test spying on it) and is what's persisted — never the AI-safe projection, which exists only to bound what the model receives.

### 5. Presentation parity

Web, mobile, and the PDF all render the identical set of sections, in the identical order: AI narrative, a "Grounded in your data" section listing specifically the patterns the AI actually cited (not everything that happened to qualify), GP discussion questions, symptom frequency with severity breakdown, period comparison, persistent symptoms, co-occurrence, cycle summary, treatment summary, and treatment impact. Mobile's screen mirrors web's page section-for-section rather than diverging in what's shown, only in RN-specific rendering mechanics.

### 6. Cross-brief trends

`brief-trends.ts` — a pure aggregation over a user's own N most recent briefs (default 6, reusing the existing `listForUser` pagination primitive rather than a new query), not a sixth deterministic-evidence detector and not a diagnostic trend engine. "Reported" (from `symptomSummary`) and "persistent" (from `persistentSymptoms`) are kept as two independently-counted signals throughout — a category appearing in every one of a user's briefs still shows `briefsPersistent: 0` if it was never actually classified persistent in any of them; repeated appearance is never inferred as persistence. `GET /briefs/trends` is registered _before_ `/briefs/:id` in the router — a real, load-bearing ordering requirement, not a stylistic one, since `idParamSchema` requires a UUID and would otherwise 400 the literal string "trends" before ever reaching this route. Deliberately textual, not charted, for this first slice, and explicit about how many briefs it represents (`briefCount`) so the UI can say "across your last 6 briefs" truthfully rather than implying an unbounded historical analysis.

### 7. Testing and verification

Exact counts, current as of `f859f00`, not implied to be a permanently frozen number: `stage4-interpretation.test.ts` 21, `stage4-validation.test.ts` 13, `stage4-ai-projection.test.ts` 11, `brief.ai.test.ts` 33, `brief-trends.test.ts` 15, `brief.test.ts` 59, plus the pre-existing `period-comparison.test.ts` (15), `persistent-symptoms.test.ts` (9), `treatment-impact.test.ts` (10), and `trends-co-occurrence.test.ts` (10) all still passing unmodified. Full `apps/api` suite: 561 passed, 5 skipped (the pre-existing conditional Redis-integration skips, unrelated). Full `apps/web`: 136 passed, including new coverage for the brief page's citation section and its "Grounded in your data" edge cases (absent/empty/null citedPatternIds, an unresolved citation id degrading gracefully). Full `apps/mobile`: 49 passed — this milestone also stood up `apps/mobile`'s first-ever screen-component test infrastructure (`react-native-web` aliased to `react-native` in the test environment only, `@testing-library/react` + `jsdom`, matching `apps/web`'s exact stack rather than adopting Jest or an unofficial Vitest/RN bridge) specifically to get `brief.tsx` under test.

Typecheck: 25 pre-existing errors on `apps/api`, unchanged in count and file set throughout this entire milestone (21 are the long-standing `generated/prisma` module-resolution gap in this sandbox, 4 are pre-existing implicit-`any` in unrelated files) — verified by diffing the exact error-file list after every single commit in this range, not just checking the count. `apps/web`/`apps/mobile` typecheck clean. This is the same sandbox-vs-`.nvmrc` Node version mismatch recorded in Milestone 19; it was never a blocker for this milestone's own test suite (unlike Milestone 19's Stripe work, everything here ran and passed directly in this sandbox), but it remains open and unrelated to any of this work.

### 8. Remaining work

**Clinical Brief 2.0 itself is complete** — the full chain (deterministic evidence → Stage 4 interpretation → AI citation → narrative → GP questions → web/mobile/PDF → cross-brief trends) is built, tested, and shipped. What follows are deliberate scope boundaries from this milestone, not unfinished pieces of it:

- No per-topic citation surfaced in the UI — a person can see the overall "Grounded in your data" list but not which specific GP question maps to which specific finding. The safety/correctness invariant (citations are real) is closed; the presentation of that fact is a separate, smaller decision.
- Trends has no charting, no client-configurable N, and best-effort (silently absent, not a visible error) loading on both frontends — all explicit first-slice choices, not gaps.
- The residual "citation without semantic faithfulness" limitation recorded in section 3 above is accepted for this milestone, backstopped only by the existing deny-list, not solved.

### Next milestone

To be scoped from here — the SSO dual-login-path decision (still open since Milestone 15) remains the one carried-over item from prior milestones' "remaining work" that hasn't been addressed by anything in this range.

## Milestone 21 — Clinical Brief frontend test hardening

A single commit (`4ce7af4`), and deliberately a separate milestone from Milestone 20 rather than an amendment to it: Milestone 20 already records the Clinical Brief 2.0 _product_ as complete, and this is a subsequent verification step, not new product surface. No production code changed anywhere in this milestone — confirmed by `git status` showing only the two test files touched — and no defects were found. This is test hardening, not a bug-fixing release, and that distinction is worth keeping visible in the record rather than blurring the two together.

**What prompted it**: an inspection of the existing web/mobile Clinical Brief test files against the full frontend behavioral surface (API contract, translations, loading/error/empty states, generation, history, detail rendering, deletion, PDF/share, severity breakdown, citations, GP discussion topics, cross-brief trends) found real, specific gaps — most notably that mobile's `handleGenerate` (the entire date-picker-to-success-or-failure flow) had zero test coverage at all, and that the deterministic evidence sections (frequency comparison, persistent symptoms, co-occurrence, cycle summary, treatment summary, treatment impact) were on both platforms only ever exercised with empty fixture defaults, never with real content.

**What changed**

- **Severity breakdown** — previously zero coverage on either platform despite real, locale-aware `Intl.ListFormat` logic. New tests on both platforms use a three-severity-level fixture and assert the exact computed narrow-conjunction string (verified directly via Node before writing the assertion, not assumed).
- **Mobile generation flow** — the single largest gap closed: validation (no dates picked), success (asserting the generated brief renders _and_ that `list`/`trends` are each genuinely called a second time, not just that some success state exists), and API failure (asserting the error text, that no success text of any kind leaked through, and that no phantom retry or refresh occurred).
- **Deletion** — mobile gained its first delete coverage entirely; both platforms gained the two branches neither covered before (deleting the currently-open brief clears the detail view; deleting the just-generated brief clears that section), asserted by checking the relevant content actually disappears, not merely that the delete call was made.
- **PDF/share** — web's download anchor `href` asserted directly; mobile's share helper asserted for the correct brief id, plus a genuine in-flight assertion using a controlled, not-yet-resolved promise to observe the label change while sharing and its reversion afterward.
- **Deterministic evidence sections with real content** — one realistic fixture per platform (verified field-for-field against the actual `BriefFrequencyComparisonEntryDto`/`BriefTreatmentImpactEntryDto`/`BriefTreatmentSummaryEntryDto` definitions in `@embr/types`, not assumed) covering frequency comparison, persistent symptoms, co-occurrence, a real cycle-length average, treatment summary, and treatment impact including the `insufficientData` case — every section's actual rendered text asserted.
- **Multiple-item rendering** — more than one discussion topic and more than one trend category, to catch what a single-item fixture can't.

**Test counts, before and after**

- Web: 13 → 21 Clinical Brief tests; full `apps/web` suite 136 → 144.
- Mobile: 11 → 24 Clinical Brief tests; full `apps/mobile` suite 49 → 62.

**Infrastructure note**: one file-scoped `vi.mock` of the app's own `DatePickerField` component was added to mobile's test file — not a change to shared test infrastructure. The shared native-picker mock in `test/setup.ts` (established in the mobile screen-testing work recorded in Milestone 20) renders nothing, correctly, for every other screen; without a way to simulate an actual date selection, `handleGenerate`'s success/failure paths were entirely unreachable. `test/setup.ts` itself is untouched, confirmed by diff, and the new mock follows the exact same per-file convention this test file already used for `../../lib/api`, `../../lib/brief-pdf`, and `../../lib/api-client`.

**Verification**: both modified files run clean independently (21/21, 24/24) and as part of their full suites (144/144, 62/62). `apps/web`/`apps/mobile` typecheck and lint both clean. `apps/api` typecheck re-run and confirmed unchanged at the established 25-pre-existing-error baseline — this milestone never touches `apps/api`. Format check clean.

**Remaining work**: loading-state transitions (history-loading, detail-loading-while-fetching, mobile's own `trendsLoading` flag) and `ja.json` locale rendering were identified during the original inspection but deliberately left out of this pass as lower-priority than the items above — noted, not forgotten.

**A second roadmap-documentation gap found in passing**: Milestone 18's own "remaining work" ("No frontend yet — neither `apps/web` nor `apps/mobile` have a treatments screen") is stale. Treatment tracking UI was actually built on both platforms in `75cd154` ("Punch-list fixes + treatment tracking UI (web + mobile)"), from an unrelated punch-list workstream that never updated this document — the same class of gap Milestone 20 closed for Clinical Brief, found again here rather than assumed away. Left as-written above rather than retroactively edited, matching this document's existing convention of preserving each milestone's text as it stood at the time (Milestone 17's own "Next" pointer is similarly left stale); recorded here instead so the next reader doesn't plan around a gap that no longer exists.

### Next milestone

To be scoped from here with that correction in mind — treatment tracking UI is not an open gap. The SSO dual-login-path decision (still open since Milestone 15) remains the one genuinely open carried-over item.
