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
3. `beforeSend` in `apps/api/src/lib/sentry.ts` already strips
   `request.cookies` and `request.data` — this handles health data, so
   don't relax that without a specific reason.

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
