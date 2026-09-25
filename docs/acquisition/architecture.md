# Architecture — Acquirer View

Verified directly against the running production infrastructure and the
current repository on 2026-09-25 (Railway API + service logs, `apps/*`
source, `docs/DEPLOYMENT.md`/`docs/BACKUPS.md`) — not carried over from
an earlier document or assumed from naming conventions. Where this
disagrees with an older internal audit, this file is the current state;
see `docs/audits/` for what's since been superseded.

## System

```text
                              EMBR
                                │
                ┌───────────────┼───────────────┬─────────────┐
                │               │                │             │
             Web app         Admin app       Mobile app     (API clients,
          (Next.js 15,     (Next.js 15,    (Expo / React    none built
           Vercel)          Vercel)          Native)         yet)
                │               │                │
                └───────────────┴────────┬───────┘
                                          │
                                         API
                                (Express, Railway,
                                 private network only)
                                          │
                ┌─────────────────────────┼─────────────────────────┐
                │                         │                         │
            PostgreSQL                 Redis                  Anthropic API
            (Railway,                (Railway,              (Clinical Brief
          private, no public      sessions + BullMQ          generation —
             endpoint)              job state)              see embr-clinical-
                │                                            logic doctrine)
                │
       Daily encrypted backup
      (Railway cron, 03:00 UTC)
                │
      embr-backups bucket
    (Railway, S3-compatible,
       private, encrypted)
```

**Worker** (`apps/worker`, BullMQ + Redis) is deployed on Railway but
currently runs only a placeholder queue — nothing in `apps/api` enqueues
a real job to it. It exists as infrastructure, not as a load-bearing
part of the product today. Don't read its Railway deployment health as
a signal about product health; see `docs/DEPLOYMENT.md`'s own note on
this.

## Correcting two assumptions worth naming explicitly

**Database backups already exist and are running, encrypted, daily.**
An internal audit dated 2026-08 flagged backups as "configured, not
functional" — true at the time (no production database existed yet to
back up). That is no longer the current state. Directly verified via
Railway's own deployment logs for the `embr-db-backup` cron service:
successful `pg_dump` → AES256-encrypted (gpg) → upload to the private
`embr-backups` bucket, on a daily 03:00 UTC schedule, with 30-day
retention pruning, going back at least to 2026-09-18 with no failed run
in that window. Full mechanics: `docs/BACKUPS.md`. Railway's own
native volume-snapshot backups (dashboard-only, no API/MCP surface to
enable them programmatically) would be a reasonable _additional_ layer
on top of this — not a substitute, and not something blocking a beta.

**Mobile is Expo/React Native, not Capacitor.** `apps/mobile/package.json`:
`expo ~57.0.12`, `react-native 0.86.2`. No Capacitor dependency exists
anywhere in this repo. This matters for any buyer-integration
conversation about the mobile codebase's portability — Expo/RN and
Capacitor have materially different technical footprints (native
modules vs. a WebView wrapper around the web build) and shouldn't be
conflated in diligence material.

## What's proprietary vs. third-party vs. replaceable

| Layer                                                                                                                                                                 | What it is                 | Replaceable?                                                                                                                                    | Switching cost                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Symptom/cycle/treatment data model, Stage 1–5 deterministic clinical-logic pipeline, evidence architecture (`Stage4Pattern`/`Stage4EvidenceRef`, evidence drill-down) | Proprietary, built here    | N/A — this is the asset                                                                                                                         | —                                                                                                                                      |
| Clinical Brief prompt design, AI-safety scoping (data-grounded only, never diagnostic, structured evidence never bypassed)                                            | Proprietary, built here    | N/A                                                                                                                                             | —                                                                                                                                      |
| Anthropic API (Clinical Brief narrative generation)                                                                                                                   | Third-party model provider | Yes — the deterministic layers upstream of it (Stage 1–4) are provider-agnostic; only the final narrative-generation call is Anthropic-specific | Low-moderate — prompt would need re-validation against a different model's output characteristics, not a rebuild of the clinical logic |
| Railway (API/worker hosting, Postgres, Redis, backup cron + bucket)                                                                                                   | Infrastructure vendor      | Yes — everything ships as a standard Dockerfile per `apps/*`; Postgres/Redis are unmodified open-source engines                                 | Low — the actual portability boundary is the Dockerfiles, not this specific platform (see `docs/DEPLOYMENT.md`)                        |
| Vercel (web/admin hosting)                                                                                                                                            | Infrastructure vendor      | Yes — both are standard Next.js 15 apps                                                                                                         | Low                                                                                                                                    |
| Resend (transactional email)                                                                                                                                          | Infrastructure vendor      | Yes — single integration point (`apps/api/src/modules/auth/mailer.ts`), HTTPS API, no SMTP-specific coupling                                    | Low                                                                                                                                    |
| PostgreSQL / Prisma schema                                                                                                                                            | Data layer                 | Engine: very low switching cost (standard Postgres). Schema/migrations: this _is_ part of the proprietary data model above                      | —                                                                                                                                      |

The durable asset is the data model, the deterministic clinical-logic
pipeline, and the evidence architecture built on top of it — not the
hosting stack. Every infrastructure vendor in the table above is a
commodity choice already isolated behind a standard interface
(Dockerfile, HTTPS API, or a stock open-source engine); none of them
represent lock-in.
