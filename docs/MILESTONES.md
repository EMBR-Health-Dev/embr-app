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

**Why it changed**

Milestone 13 flagged this as the more clearly-scoped of its two remaining frontend gaps, and it was actually blocking something live: the invite email has been linking to a 404 since Milestone 12 shipped `inviteMember()`. The redirect-survival design follows directly from `requireAuth()` being applied to _all_ organization routes including `/organizations/invites/accept` (see `organization.routes.ts`'s `router.use("/organizations", requireAuth())`) — there was no version of this feature that could skip the logged-out case.

**A verification note for this sandbox**

No backend files touched this milestone, so the API test suite is an unchanged baseline (ran green, same 64/64 as M13). `packages/types`/`validation`/`shared` rebuild clean; `apps/web`'s `tsc --noEmit` passes with no errors across the whole app (new and pre-existing files alike); `eslint` passes on every new/modified file. Same as Milestones 4, 8, and 13: `apps/web`'s `next build` itself couldn't be verified in this sandbox (no route to Google Fonts) — unrelated to this milestone's code, not attempted as a substitute for the typecheck/lint checks above.

**Remaining work (explicitly out of scope for M14)**

- No self-service "leave organization" action for a member — carried over from Milestone 13, still just an `ORG_ADMIN` revoking someone else.
- SSO — still not started.
- The accept-invite page's "already joined" and error states don't offer a way to switch accounts if the visitor is logged in as the wrong person (e.g. invite sent to a work email, visitor logged in on a personal one, hits the "different email address" 403). Worth a follow-up if that turns out to be a common support request rather than an edge case.

**Next milestone**
To be scoped from here — candidates: SSO, the Prisma-migrations gap from Milestone 11, or the wrong-account edge case flagged above if it proves to matter in practice.
