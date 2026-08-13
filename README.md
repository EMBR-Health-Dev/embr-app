# EMBR Platform

EMBR is the evidence infrastructure for menopause.

Most menopause apps ask a woman to track symptoms and hand her a chart. EMBR is built around a different loop:

Women generate longitudinal data
→ EMBR structures it
→ EMBR identifies meaningful patterns
→ EMBR converts those patterns into clinician-ready evidence
→ Clinicians make better-informed decisions
→ Employers understand population-level impact without ever accessing individual health data

EMBR is not a diagnostic tool and does not give medical advice. It turns what a woman already tracks into structured, observational evidence she can bring into a clinical conversation — and, in aggregate and fully anonymized, into workplace impact data an employer can act on without seeing anyone's individual health information.

**Current status**: production deployment in progress (web, admin, API) with a companion mobile app in active development (Expo, iOS/Android). See `docs/DEPLOYMENT.md` for the deploy architecture and `docs/MILESTONES.md` for the milestone plan.

## Stack

- **apps/api** — Express + TypeScript, Prisma/PostgreSQL, Redis, OpenAPI-first, structured logging
- **apps/web** — Next.js 15 / React 19, patient-facing product
- **apps/admin** — Next.js 15 / React 19, internal operations console
- **apps/worker** — BullMQ background job processor
- **packages/shared** — logger, error taxonomy, env validation, HTTP middleware (used by api + worker)
- **packages/types** — cross-app TypeScript types
- **packages/validation** — shared Zod schemas
- **packages/sdk** — typed API client (generated from OpenAPI from Milestone 2 onward)
- **packages/ui** — shared React component library (shadcn/ui-based)

## Quickstart

```bash
cp .env.example .env
pnpm install
pnpm docker:up            # postgres, redis, mailhog
pnpm db:generate
pnpm db:migrate
pnpm dev                  # runs all apps in parallel via Turborepo
```

- API: http://localhost:4000 (docs at `/docs`, health at `/health/live` and `/health/ready`)
- Web: http://localhost:3000
- Admin: http://localhost:3001
- MailHog UI: http://localhost:8025

## Commands

| Command                                    | Description                                        |
| ------------------------------------------ | -------------------------------------------------- |
| `pnpm dev`                                 | Run all apps in dev mode                           |
| `pnpm build`                               | Build all apps/packages via Turborepo              |
| `pnpm lint` / `pnpm typecheck`             | Static checks across the monorepo                  |
| `pnpm test`                                | Unit/integration tests (Vitest + Supertest)        |
| `pnpm test:e2e`                            | Playwright end-to-end tests                        |
| `pnpm docker:up` / `docker:down`           | Local infra (Postgres, Redis, MailHog)             |
| `pnpm db:migrate` / `db:studio`            | Prisma migrations / GUI                            |
| `./scripts/db-backup.sh`                   | Encrypted database backup (see `docs/BACKUPS.md`)  |
| `./scripts/db-restore-test.sh`             | Restore a backup into a scratch DB and verify it   |
| `node scripts/setup-branch-protection.mjs` | One-time GitHub branch protection setup for `main` |

See `docs/ARCHITECTURE.md` for design decisions, `docs/MILESTONES.md` for engineering roadmap and progress, `docs/DEPLOYMENT.md` for the production deployment path, `docs/BACKUPS.md` for the backup/restore workflow, and `docs/INCIDENT_RESPONSE.md` for the on-call runbook.
