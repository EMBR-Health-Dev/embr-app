# Deployment

This describes the recommended path to production. As of Milestone 11,
this is guidance and tooling — pipeline configs, scripts, docs — not a
claim that the platform is currently deployed anywhere. Whoever runs
these steps first should update this doc with the actual URLs/dashboards
once live.

## Recommended platforms

| Service                  | Platform                                  | Why                                                                                                                                                      |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`               | Railway or Fly.io                         | Both run long-lived containers with attached Postgres/Redis, and both build straight from the existing `apps/api/Dockerfile` with no changes needed.     |
| `apps/worker`            | Same platform as `apps/api`               | Needs to share the same Postgres/Redis instances; keeping it on the same platform avoids cross-provider network latency/cost for BullMQ's Redis polling. |
| `apps/web`, `apps/admin` | Vercel                                    | Both are already Next.js 15 apps — Vercel is the path of least friction and gives preview deployments per PR for free.                                   |
| Postgres                 | Railway/Fly managed Postgres, or Supabase | Managed backups exist on all three, but see `docs/BACKUPS.md` — the app-level backup script here is a deliberate second layer, not a replacement.        |
| Redis                    | Railway/Fly managed Redis, or Upstash     | Upstash's serverless pricing model fits a worker that is often idle.                                                                                     |

None of these are hard requirements — the Dockerfiles under each `apps/*`
directory are the actual portability boundary, and any container platform
works.

## Pipeline shape

```
main
  ↓
GitHub Actions (.github/workflows/ci.yml)
  ↓ (lint, typecheck, test, coverage, security scan — all must pass)
Build
  ↓
Deploy API + Worker  (Railway/Fly — connect the GitHub repo, auto-deploy on push to main)
Deploy Web + Admin   (Vercel — connect the GitHub repo, auto-deploy on push to main)
```

Railway, Fly, and Vercel all support "deploy on push to `main`" as a
built-in GitHub integration — there's deliberately no custom deploy step
added to `ci.yml` here, since duplicating what the platform's own GitHub
App already does would just be two systems that can disagree about what
"deployed" means.

## Secrets management

Never commit real secrets to this repo — `.env` is git-ignored precisely
so this doesn't happen by accident. In order of preference for where
production secrets actually live:

1. **Platform-native secrets** (Railway Variables, Vercel Environment
   Variables, Fly `fly secrets`) for anything only that platform's
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

**Frontend error monitoring**: `apps/web`, `apps/admin`, and `apps/mobile`
all have client-side (and, for the two Next.js apps, server + edge)
error capture via `@sentry/nextjs`/`@sentry/react-native`, matching the
backend's no-op-unless-`*_SENTRY_DSN`-is-set precedent:

- `apps/web`: `src/instrumentation-client.ts` (browser),
  `sentry.server.config.ts`/`sentry.edge.config.ts` (SSR/route
  handlers), `src/app/global-error.tsx` (root React error boundary).
  `NEXT_PUBLIC_SENTRY_DSN`.
- `apps/admin`: identical structure to `apps/web`.
  `NEXT_PUBLIC_SENTRY_DSN` — use a different Sentry project's DSN than
  `apps/web`'s, matching the backend's one-project-per-service
  precedent.
- `apps/mobile`: `lib/sentry.ts` (`initSentry()`, called from
  `app/_layout.tsx` before the app renders; `Sentry.wrap(RootLayout)`
  adds the React error boundary + native crash reporting).
  `EXPO_PUBLIC_SENTRY_DSN`.

Each app's own `beforeSend` (`redactSentryEvent` in each app's
`sentry-redact.ts`/`lib/sentry.ts`) strips `request.cookies`,
`request.headers`, `request.data`, `request.query_string`, the query
portion of `request.url`, and every breadcrumb's `data`/`message`
fields — browser/RN SDKs auto-record DOM click and HTTP breadcrumbs
that can otherwise carry form values, bearer tokens, or API response
bodies. Session Replay is deliberately not enabled anywhere — its
DOM/screenshot capture is a much larger privacy surface than error
events alone for a product handling health data; revisit only with its
own dedicated redaction review.

Set `NEXT_PUBLIC_SENTRY_DSN` (web, admin) and `EXPO_PUBLIC_SENTRY_DSN`
(mobile) as platform secrets per service, same as `SENTRY_DSN` above.

## Email delivery

`apps/api/src/modules/auth/mailer.ts` sends verification, password-reset,
and organization-invite emails via SMTP (`nodemailer`). Local dev/test
points at MailHog (`docker-compose.yml`), which accepts unauthenticated
connections — this is why `SMTP_USER`/`SMTP_PASS` aren't required by
default.

**What's already handled from the repo, no code change needed to go
live**: point `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` at any
real SMTP-speaking provider (SES's SMTP interface, Postmark, SendGrid,
...) and set `SMTP_REQUIRE_TLS=true` — the transport wires
authentication and TLS correctly based on these alone.

**What's genuinely external, not something a code change can do**:

- An actual provider account and its SMTP credentials.
- **Sending-domain DNS records** — SPF, DKIM, and ideally DMARC for
  whatever domain `SMTP_FROM` uses. Without these, most providers will
  still accept the send but real inboxes (especially Gmail/Outlook)
  will mark the mail as spam or reject it outright — this is the
  single most common reason "email works in testing but nobody gets
  the verification link in production" happens, and it's entirely a
  DNS/provider-console task, not a repo one.
- Provider-side sending limits/reputation warm-up for a new sending
  domain, if the provider requires it.

**Verifying it's actually working**: `GET /health/ready` now includes
an `smtp` check (`verifyMailTransport()` in mailer.ts) that confirms
the transport can connect and authenticate — hit this in staging after
setting the env vars above to confirm SMTP is genuinely configured
correctly, rather than discovering it's broken only when a real user's
verification email silently never arrives. Deliberately excluded from
the endpoint's overall pass/fail status (a mail-provider outage
shouldn't pull an otherwise-healthy API instance out of a load
balancer's rotation) — check the `checks.smtp` field specifically, not
just the top-level `status`.

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
- **Web/Admin**: Vercel keeps every deployment and lets you "promote to
  production" any prior one instantly.
- **Database migrations**: `apps/api/prisma/schema.prisma` is the source
  of truth; no migration history is committed to this repo yet (CI runs
  `prisma migrate deploy`, so this needs to exist before a real
  production deploy — run `pnpm db:migrate` locally once to generate and
  commit the first migration). Once migrations exist, treat any that
  drop or rename a column as high-risk: take a manual backup via
  `scripts/db-backup.sh` first and confirm the rollback plan for that
  specific migration, since `prisma migrate deploy` has no automatic
  "undo."

## Branch protection

Run `scripts/setup-branch-protection.mjs` once (see the script's header
comment for usage) to require CI to pass, require one PR approval, and
block force-pushes/deletion on `main`.
