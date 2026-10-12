# Deployment

This describes how EMBR is deployed. It started as the recommended path
(Milestone 11); "Current production setup" below records what actually
runs today, and the rest of the doc has been brought in line with it.

## Current production setup

_Last checked against Railway: 11 October 2026._

Everything runs in one Railway project, `embr-production`, environment
`production`, region `ams` (EU, Amsterdam). Every app service builds
from `main` of `EMBR-Health-Dev/embr-app` and redeploys on push when a
file matching its watch patterns changes.

| Railway service         | What it is                | Build                                   | Public address                                                | Notes                                                               |
| ----------------------- | ------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@embr/api`             | `apps/api`                | Dockerfile `/apps/api/Dockerfile`       | `embrapi-production.up.railway.app`                           | Pre-deploy runs `prisma migrate deploy`; healthcheck `/health/live` |
| `@embr/web`             | `apps/web`                | Dockerfile `/apps/web/Dockerfile`       | `app.embrhealthcare.com`, `embrweb-production.up.railway.app` | Healthcheck `/`                                                     |
| `@embr/admin`           | `apps/admin`              | Dockerfile `/apps/admin/Dockerfile`     | `embradmin-production.up.railway.app`                         | Moved from Vercel on 11 October 2026; see "Admin app" below         |
| `@embr/worker`          | `apps/worker`             | Dockerfile `/apps/worker/Dockerfile`    | none (private only)                                           | Moved off Railpack on 11 October 2026; see "Worker" below           |
| `@embr/mobile`          | `apps/mobile`             | Railpack                                | none                                                          |                                                                     |
| `efficient-benevolence` | Encrypted Postgres backup | Dockerfile `/scripts/backup/Dockerfile` | none                                                          | Cron `0 3 * * *` (03:00 UTC daily); see `docs/BACKUPS.md`           |
| `Postgres`, `Redis`     | Managed databases         | Railway                                 | none (private network)                                        |                                                                     |

Vercel is no longer part of production. A Vercel project for the admin
app (`embr-admin`) may still be connected to the repository and post
preview statuses on pull requests; those statuses are not required
checks, and the project can be disconnected in Vercel (Settings → Git).

### Admin app

- **Builder must be the Dockerfile, not Railpack.** Railpack ran
  `pnpm --filter @embr/admin build` without building the workspace
  packages first, so every build failed with
  `Module not found: Can't resolve '@embr/validation'`.
  `apps/admin/Dockerfile` builds `@embr/types` and `@embr/validation`
  before the app.
- **`API_URL`** is set on the service to the API's public address. It
  is a build argument: `next.config.ts` bakes it into the `/api/*`
  same-origin proxy at build time, so changing it needs a rebuild.
- **Watch patterns**: `/apps/admin/**`, `/packages/types/**`,
  `/packages/validation/**`, `/pnpm-lock.yaml`.
- **`CORS_ORIGIN` on `@embr/api` must include
  `https://embradmin-production.up.railway.app`.** The proxy forwards the
  browser's `Origin` header, and the API rejects origins it doesn't
  list, so admin sign in fails without it. Append it to the existing
  list; never replace the list.

### Worker

- **Builder must be the Dockerfile, not Railpack**, for the same reason
  as the admin app: Railpack ran `pnpm --filter @embr/worker build`
  without building `@embr/shared` first, so the build failed with
  `Cannot find module '@embr/shared'`. `apps/worker/Dockerfile` builds
  `@embr/shared` before the worker. No build or start command is set on
  the service; the Dockerfile's `CMD` starts it.
- **Variables**: `REDIS_URL` = `${{Redis.REDIS_URL}}` and
  `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway references). The
  worker exits at startup if either is missing. `SENTRY_DSN` is optional.
- **Watch patterns**: `/apps/worker/**`, `/packages/shared/**`,
  `/pnpm-lock.yaml`.
- **Restart policy**: on failure, up to 10 retries.

## Recommended platforms

| Service                  | Platform                                  | Why                                                                                                                                                      |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`               | Railway or Fly.io                         | Both run long-lived containers with attached Postgres/Redis, and both build straight from the existing `apps/api/Dockerfile` with no changes needed.     |
| `apps/worker`            | Same platform as `apps/api`               | Needs to share the same Postgres/Redis instances; keeping it on the same platform avoids cross-provider network latency/cost for BullMQ's Redis polling. |
| `apps/web`, `apps/admin` | Railway (Dockerfile builds)               | Originally planned for Vercel. Both now run on Railway beside the API, so one platform holds every service and the data stays in one EU region.          |
| Postgres                 | Railway/Fly managed Postgres, or Supabase | Managed backups exist on all three, but see `docs/BACKUPS.md` — the app-level backup script here is a deliberate second layer, not a replacement.        |
| Redis                    | Railway/Fly managed Redis, or Upstash     | Upstash's serverless pricing model fits a worker that is often idle.                                                                                     |

None of these are hard requirements — the Dockerfiles under each `apps/*`
directory are the actual portability boundary, and any container platform
works.

**`apps/worker`'s current state**: the process, Dockerfile, and BullMQ
wiring are real and deployable, but it only runs a placeholder
`system-maintenance` queue (`apps/worker/src/index.ts`) that logs and
returns — nothing in `apps/api` enqueues a real job to it yet. PDF
generation and the Clinical Brief AI call are both fully synchronous
within the API's own request/response cycle today (the AI call has its
own 30s timeout for exactly that reason — see `brief.ai.ts`). Deploying
`apps/worker` right now keeps the door open for real async jobs later;
it does not currently do anything a beta depends on, so it is deferrable
if minimizing what's deployed for a first beta matters more than having
the process running.

## Pipeline shape

```
main
  ↓
GitHub Actions (.github/workflows/ci.yml)
  ↓ (lint, typecheck, test, coverage, security scan — all must pass)
Build
  ↓
Deploy API + Worker  (Railway/Fly — connect the GitHub repo, auto-deploy on push to main)
Deploy Web + Admin   (Railway — same project, auto-deploy on push to main)
```

Railway and Fly both support "deploy on push to `main`" as a
built-in GitHub integration — there's deliberately no custom deploy step
added to `ci.yml` here, since duplicating what the platform's own GitHub
App already does would just be two systems that can disagree about what
"deployed" means.

## Secrets management

Never commit real secrets to this repo — `.env` is git-ignored precisely
so this doesn't happen by accident.

Two git-ignored files hold local secrets, for two different runtimes:

- **`.env`** (repo root, template `.env.example`) — the host dev
  servers (`pnpm dev`). Everything the API and workers read, including
  the JWT/SSO/Anthropic keys.
- **`docker/api.env`** (template `docker/api.env.example`) — the
  containerized API in `docker/docker-compose.yml`, which loads it via
  `env_file` (#120). Only the four keys compose's own `environment:`
  block doesn't already set (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
  SSO_ENCRYPTION_KEY, ANTHROPIC_API_KEY) — `environment:` wins over
  `env_file` for any key both define, so DATABASE_URL/REDIS_URL/SMTP
  keep coming from the compose file itself. One-time setup:
  `cp docker/api.env.example docker/api.env`; without it, `compose up`
  fails fast with "env file not found" instead of crash-looping the
  API. Real values should be generated per machine (`openssl rand
-base64 48` for JWT, `-base64 32` for the SSO key).

In order of preference for where production secrets actually live:

1. **Platform-native secrets** (Railway Variables, which is what
   production uses, or Fly `fly secrets`) for anything only that platform's
   process needs — simplest option, no extra tool to run.
2. **GitHub Actions Secrets** (repo Settings → Secrets and variables →
   Actions) for anything a CI/CD workflow itself needs to read — e.g.
   `PRODUCTION_DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` for
   `.github/workflows/backup.yml`.
3. **Doppler or 1Password Secrets Automation** if secrets need to be
   shared identically across more than one of the above (e.g. the same
   `JWT_ACCESS_SECRET` value needs to exist in both Railway and a local
   `.env` for a teammate) — worth adopting once there's a second person
   who needs access, not before.

Every secret referenced by `.env.example` needs a real, unique value in
production — `openssl rand -hex 32` for JWT/session secrets,
`openssl rand -base64 32` for `BACKUP_ENCRYPTION_KEY`. None of the dev
placeholder values in `.env.example` are safe to reuse.

## Error monitoring

`apps/api` and `apps/worker` both call `initSentry()` on startup (see
`apps/api/src/lib/sentry.ts` and `apps/worker/src/sentry.ts`) — this is a
no-op until `SENTRY_DSN` is set, so:

1. Create a Sentry project per service (`embr-api`, `embr-worker` — kept
   separate so an API 500 spike and a stuck job queue don't get lost in
   each other's noise).
2. Set `SENTRY_DSN` as a platform secret for each service.
3. Both services' `beforeSend` (`redactSentryEvent` in `apps/api/src/lib/sentry.ts`,
   inline in `apps/worker/src/sentry.ts`) strip `request.cookies`,
   `request.data`, `request.query_string`, and the query portion of
   `request.url` — the last one matters as much as the others:
   Sentry's own HTTP integration auto-captures `event.request.url`
   independently of anything manually passed as `context`, and
   `GET /auth/sso/callback` carries a real OAuth authorization code
   in exactly that field. Don't relax any of this without a specific
   reason.
4. `captureException(err, context)`'s `context` becomes Sentry's
   `event.extra`, which is **not** touched by `beforeSend` — every
   current call site only ever passes identifiers/metadata (requestId,
   jobId, ...), never raw request/job data, and it needs to stay that
   way. See the doc comment directly on `captureException` in both
   files.

**Known gap, not addressed here**: `apps/web`, `apps/admin`, and
`apps/mobile` have no error monitoring at all — no Sentry (or
equivalent) dependency, no client-side crash/error capture. This means
frontend-only failures (a React render error, a mobile crash before a
request ever reaches the API) are currently invisible to anything but
a person's own bug report. Setting this up is a real, separate piece
of work — new dependencies and init code across three apps, plus its
own PII-redaction pass (client-side error capture commonly includes
breadcrumbs of user interactions, which is exactly the kind of thing
that needs the same scrutiny given this product's data) — not
something to fold into a backend-focused hardening pass. Worth
prioritizing before a wider beta, not before a small closed one.

## Email delivery

`apps/api/src/modules/auth/mailer.ts` sends verification, password-reset,
and organization-invite emails via [Resend](https://resend.com)'s HTTPS
API. This replaced an earlier Nodemailer/SMTP transport outright — Railway
(where `apps/api` actually runs, despite the platform table above)
blocks all outbound SMTP ports below its Pro plan, and recommends
HTTPS-API email providers even where SMTP is available. There is
deliberately no SMTP fallback: an HTTPS-only path doesn't depend on
Railway's plan tier or outbound port policy at all.

**What's already handled from the repo, no code change needed to go
live**: set `RESEND_API_KEY` (from the Resend dashboard) and, if the
sending domain ever changes, `EMAIL_FROM` (defaults to
`no-reply@embrhealthcare.com`). Both are optional at the schema level —
if `RESEND_API_KEY` is unset (local dev/CI without a real Resend
account), the mailer logs and skips sending rather than failing, so
nothing needs to be configured just to boot the API locally.

**What's genuinely external, not something a code change can do**:

- A Resend account and API key.
- **A verified sending domain** in Resend (SPF/DKIM records on whatever
  domain `EMAIL_FROM` uses) — Resend won't send from an unverified
  domain. This is the equivalent of the DNS/DMARC work any SMTP
  provider would have needed too; it's a Resend-console/DNS task, not a
  repo one.
- Provider-side sending limits, if Resend's plan requires raising them.

**Verifying it's actually working**: `GET /health/ready` includes an
`email` check (`isEmailConfigured()` in mailer.ts) that reports whether
`RESEND_API_KEY` is set. This is a configuration-presence check, not a
live API call — Resend has no bare "verify these credentials" endpoint,
and probing one of its admin endpoints (listing API keys/domains) would
falsely report "down" for a correctly configured, least-privilege
sending-only key, which is the right key type for this use case.
Deliberately excluded from the endpoint's overall pass/fail status (a
mail-provider issue shouldn't pull an otherwise-healthy API instance out
of a load balancer's rotation) — check the `checks.email` field
specifically, not just the top-level `status`.

## Health check monitoring

`GET /health/live` and `GET /health/ready` already exist
(`apps/api/src/routes/health.ts`). Point an external uptime monitor
(UptimeRobot, Better Stack, or Railway/Fly's own built-in health checks)
at `/health/ready` in production — it checks Postgres and Redis
reachability, not just "the process is running", which is the check that
actually correlates with "can a user log in right now."

Alert on:

- `/health/ready` returning non-200 for 2+ consecutive checks (avoids
  paging on a single transient blip)
- Response latency p95 above ~2s sustained (early warning before an
  outage, not just after one)

## Database backups

See `docs/BACKUPS.md`.

## Rollback strategy

- **API/Worker**: Railway and Fly both keep prior deployments and support
  one-click/one-command rollback to the last known-good image — no
  extra tooling needed here.
- **Web/Admin**: same as the API: Railway keeps prior deployments and
  can roll back to the last good one from the service's Deployments tab.
- **Database migrations**: `apps/api/prisma/schema.prisma` is the source
  of truth; `apps/api/prisma/migrations` now holds a real, linear
  migration history (17 migrations as of this writing, from the
  initial schema through the day-level evidence layer). Generate new ones
  with `pnpm db:migrate` against a real local Postgres and commit the
  result, same as every prior one.
  `prisma migrate deploy` running in `ci.yml` only ever applies
  against CI's own ephemeral Postgres service container — it verifies
  the migration history is valid and applies cleanly, it is not itself
  a production deploy step.
  **Verified 2026-09-25 — the production deploy step does exist**: the
  `@embr/api` Railway service's `preDeployCommand` runs
  `pnpm --filter @embr/api exec prisma migrate deploy` before every
  deploy (confirmed directly against Railway's own service config,
  not assumed), so migrations do reach the real production database on
  every push to `main`. Treat any migration that drops or renames a
  column as high-risk regardless: take a manual backup via
  `scripts/db-backup.sh` first and confirm the rollback plan for that
  specific migration, since `prisma migrate deploy` has no automatic
  "undo." See `docs/acquisition/readiness.md` for the current
  engineering-verified status of this and other production claims.

## Mobile app builds & submission

`apps/mobile/eas.json` defines three EAS Build profiles:

- **development** — `developmentClient: true`, internal distribution,
  points at `localhost:4000`. For running a custom dev client against
  a locally-running API.
- **preview** — internal distribution (no App Store/Play Store
  submission), points at a `staging-api.embr.health` placeholder.
  Update this once a real staging API domain exists. Use this profile
  for TestFlight-internal or ad-hoc Android builds during the beta.
- **production** — auto-increments the build number, points at an
  `api.embr.health` placeholder. Update this once the real production
  API domain exists — **do not ship a production build with a
  placeholder API URL.**

Both non-development `EXPO_PUBLIC_API_URL` values in `eas.json` are
placeholders following this product's intended domain (matching
`SMTP_FROM`'s existing `@embr.health` convention in `.env.example`) —
neither domain is registered or deployed yet as of this writing. This
is safe to commit as-is (it's a public, non-secret build-time value,
not a credential) but must be corrected before running a real preview
or production build, or the built app will simply fail to reach any
API.

**One-time setup, not yet done** (needs an Expo account, so it can't
be run from an unattended environment): `eas init` (or `eas
build:configure`) from `apps/mobile`, which links this project to a
real EAS project and writes the resulting `extra.eas.projectId` into
`app.json`. Do this before the first real build — `eas build` will
fail without it.

**Building**: `eas build --profile preview --platform ios` (or
`android`, or `--platform all`) from `apps/mobile`. **Submitting**:
`eas submit --platform ios` for TestFlight, once a build exists and an
Apple Developer account is set up — the `submit` section in
`eas.json` is currently an empty placeholder (`{}`); it needs
`appleId`/`ascAppId`/`appleTeamId` (or equivalent Android
service-account config) filled in once that account exists, which
this repo has no evidence of yet.

## Branch protection

Run `scripts/setup-branch-protection.mjs` once (see the script's header
comment for usage) to require CI to pass, require one PR approval, and
block force-pushes/deletion on `main`.

## Sign up (private early access)

New accounts are closed until EMBR is incorporated and the Privacy Policy
and Terms are final and published (drafts: `docs/legal/drafts/`). Existing
accounts sign in as normal.

| Where  | Variable                        | Default        | Effect                                                                             |
| ------ | ------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| API    | `PUBLIC_REGISTRATION_ENABLED`   | `false`        | `POST /auth/register` returns `403 REGISTRATION_CLOSED` before reading the request |
| Web    | `NEXT_PUBLIC_REGISTRATION_OPEN` | unset (closed) | `/register` shows an early access page; login links to early access                |
| Mobile | `EXPO_PUBLIC_REGISTRATION_OPEN` | unset (closed) | Register screen shows early access                                                 |

Organization invites are not an exception. An invite adds an existing
account to an organization; it never creates one, and the API refuses new
accounts the same way with or without one. People who already have an
account can still log in and accept. While sign up is closed, the invite
page offers newcomers early access instead of "Create an account".

To reopen: publish the final legal documents, add their links back to the
consent screen (`LEGAL_DOCUMENT_URLS`, see `docs/legal/consent-decision-sheet.md`),
set the final `LEGAL_DOCUMENT_VERSIONS`, then set all three to `true` (web and
mobile need a rebuild, since public env values are baked in at build time; the
web Dockerfile takes `NEXT_PUBLIC_REGISTRATION_OPEN` as a build argument, which
Railway fills from the service variable of the same name).

## Production configuration checklist

A human operator's checklist for verifying a real deployment's
environment — not a claim that any of this is currently set anywhere.
Never paste real values into a PR, issue, or chat when working through
this; just confirm each is set, in whatever secret store the platform
uses. `.env.example` documents every variable `apps/api` reads; this
groups them by what happens if you forget.

**Will refuse to boot at all if missing** (`apps/api/src/config/env.ts`
fails fast with a specific per-field message — see
`docs/ARCHITECTURE.md`'s "fail fast on bad config" rule):

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (each ≥32 chars — generate
  with `openssl rand -hex 32`, never reuse `.env.example`'s placeholders)
- `SSO_ENCRYPTION_KEY` (must decode to exactly 32 bytes —
  `openssl rand -base64 32`)
- `ANTHROPIC_API_KEY`

**Boots fine, but silently misconfigured for real users if forgotten**
(this is the dangerous category — no crash, no error, just wrong
behavior the first real user hits):

- `APP_URL` — required as of this pass whenever `NODE_ENV=production`
  (previously defaulted to `localhost:3000`, silently corrupting every
  password-reset/verification/org-invite email link, SSO redirect, and
  Stripe Checkout return URL). Set to the real, public app origin.
- `CORS_ORIGIN` — same production requirement. Set to the real
  browser-facing origin(s), comma-separated if more than one. Get this
  wrong and every real browser request gets rejected by CORS (a loud,
  visible failure in this direction, at least).
- `COOKIE_SECURE` — defaults to `true` outside development/test, so
  leaving it unset in production is actually the safe outcome. Confirm
  it's _not_ explicitly set to `false` anywhere in the real deploy config.
- `EMAIL_FROM` — must be a verified-in-Resend sending domain, or Resend
  will reject every send (see "Email delivery" above).

**Genuinely optional — the corresponding feature just stays inert**
(confirm this matches intent for this deploy, don't treat "unset" as
automatically wrong):

- `RESEND_API_KEY` unset → no transactional email sends (verification,
  password reset, org invites all silently no-op — real if intentional
  for a very first internal test, a real problem for actual beta users)
- `SENTRY_DSN` unset → no error monitoring for `apps/api`/`apps/worker`
  (client-side error monitoring doesn't exist yet regardless — see the
  "Known gap" note above)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_SEAT_PRICE_ID`
  unset → billing routes return a clean 503, not a crash; fine if this
  beta isn't charging anyone yet

**Build-time, not runtime** — baked into the built artifact and can't
be changed by an env var at container start:

- `apps/web`/`apps/admin`'s `API_URL` build arg (Dockerfile) — must
  point at the real API's reachable address at build time
- `apps/mobile`'s `EXPO_PUBLIC_API_URL` per EAS build profile
  (`eas.json`) — still placeholder domains as of this writing (see
  "Mobile app builds" above); a production build made before these are
  corrected will build successfully and simply be unable to reach any
  API

**Migrations**: the `@embr/api` Railway service runs
`pnpm --filter @embr/api exec prisma migrate deploy` as its pre-deploy
command, before the new API version starts serving traffic (see
"Rollback strategy" above). Keep it there on any new platform. This is the one item on this list that
isn't an env var at all, but is just as capable of leaving the API
"boots fine, immediately broken" if skipped.
