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

- No actual product screens past the auth flow — symptom logging, cycle tracking, trends, all still to build. The home screen says as much rather than pretend otherwise.
- `GET /auth/sessions`'s "is this the current device" marking relies on reading the refresh token cookie server-side — mobile has no cookie, so that field just won't distinguish "this device" from any other session in a future sessions-list screen. Minor UX nuance, not a blocker; noted here rather than silently left for someone to puzzle over later.
- `expo-modules-core`'s declared peer range for `react-native-worklets` (`^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`) hasn't caught up to the `0.11.3` that `react-native-reanimated` (pulled in transitively by `expo-router`'s own drawer-navigation dependency, not something this app uses directly) actually needs — a soft peer-dependency warning, not an install or build failure; very plausibly just SDK 57 being three weeks old at time of writing and the ecosystem not fully caught up yet. Worth a glance next time dependencies are touched, not worth forcing an override now.
- No test framework wired up yet (no `test` script) — deferred rather than reaching for `jest-expo` just to have something, given there's no product logic yet to test.
- Backend decision explicitly deferred by design (per how this milestone was scoped): whether mobile gets its own dedicated API/BFF (push notifications, device tokens, etc.) or continues sharing `apps/api` directly, as it does today.

**Next milestone**
To be scoped from here — most likely candidates: the first real product screen (symptom logging, reusing the validation schemas and DTOs already shared with the backend), or the mobile-specific backend decision flagged above if push notifications become a near-term need.
