# EMBR Platform

AI-powered perimenopause and menopause health platform.

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

| Command                          | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `pnpm dev`                       | Run all apps in dev mode                    |
| `pnpm build`                     | Build all apps/packages via Turborepo       |
| `pnpm lint` / `pnpm typecheck`   | Static checks across the monorepo           |
| `pnpm test`                      | Unit/integration tests (Vitest + Supertest) |
| `pnpm test:e2e`                  | Playwright end-to-end tests                 |
| `pnpm docker:up` / `docker:down` | Local infra (Postgres, Redis, MailHog)      |
| `pnpm db:migrate` / `db:studio`  | Prisma migrations / GUI                     |

See `docs/ARCHITECTURE.md` for design decisions and `docs/MILESTONES.md` for engineering roadmap and progress.
