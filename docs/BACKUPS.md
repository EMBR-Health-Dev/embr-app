# Database Backups

## What exists

Production Postgres is intentionally private — no public access, no TCP
proxy (see `docs/DEPLOYMENT.md`). That means the backup job has to run
somewhere with reach to Railway's private network, not on a GitHub-hosted
runner. The active mechanism is:

- **`embr-db-backup`** — a Railway service (`scripts/backup/Dockerfile`,
  `postgres:18-alpine` base so `pg_dump`'s version matches the production
  server) on a daily cron schedule (`0 3 * * *`, UTC). It runs
  `scripts/db-backup.sh` **unchanged in its dump/encrypt/upload logic**
  against Postgres over the private network (`${{Postgres.DATABASE_URL}}`
  — never a public endpoint) and uploads the encrypted dump to the
  **`embr-backups`** Railway Bucket (private, S3-compatible, encrypted at
  rest, reached only via its own bucket credentials).
- `scripts/db-backup.sh` — dumps Postgres (`pg_dump -Fc`), encrypts the
  dump with AES256 (gpg symmetric), optionally uploads to S3-compatible
  storage, and prunes anything older than the retention window (default
  30 days).
- `scripts/db-restore-test.sh` — decrypts a backup and restores it into a
  scratch database, then sanity-checks that it actually contains data.
  Not yet wired into an automated schedule — see "What this doesn't cover"
  below.
- `.github/workflows/backup.yml` — **currently inactive for the daily
  backup path.** It predates the private-Postgres discovery: a
  GitHub-hosted runner has no route to `postgres.railway.internal`, so
  `PRODUCTION_DATABASE_URL` was never actually reachable from it, and
  even with that secret set the job would still fail to connect. Kept in
  the repo as-is rather than deleted in this pass — worth a deliberate
  decision on whether to disable or repurpose it now that `embr-db-backup`
  is the real path.

## Why encryption isn't optional here

This is health data. A backup is a full copy of the database sitting
somewhere outside the access controls the running application enforces —
an unencrypted backup in a bucket is a second attack surface with none of
the app's authentication/authorization in front of it. `BACKUP_ENCRYPTION_KEY`
being a real, unique secret (not a placeholder) matters as much as any
other production credential in this repo.

## `embr-db-backup` configuration (already done — recorded for reference)

The service's variables, all set directly on it in Railway (not in this
repo):

| Variable                                                                                  | Value                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                            | `${{Postgres.DATABASE_URL}}` — private network reference, never a public endpoint                                                                       |
| `BACKUP_ENCRYPTION_KEY`                                                                   | a real, unique secret generated with `openssl rand -base64 32` — **losing this makes every backup taken with it unrecoverable; it exists nowhere else** |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_DEFAULT_REGION` / `AWS_ENDPOINT_URL` | references to the `embr-backups` Railway Bucket's own credentials                                                                                       |
| `BACKUP_S3_BUCKET`                                                                        | `s3://${{embr-backups.BUCKET}}`                                                                                                                         |

Cron schedule: `0 3 * * *` (daily, UTC), `restartPolicyType: NEVER` — a
failed run is not retried until the next scheduled tick, so it can't
retry-loop.

If this service is ever recreated, redo this list — Railway Bucket
credentials are per-bucket and not something to copy from elsewhere.

## Setup checklist for the dormant GitHub Actions path (`backup.yml`)

Only relevant if that workflow is ever repurposed instead of removed —
see the note above. It would still need:

1. Repo secrets (Settings → Secrets and variables → Actions):
   `PRODUCTION_DATABASE_URL` (would need to be reachable from a
   GitHub-hosted runner — it currently isn't), `BACKUP_ENCRYPTION_KEY`,
   `BACKUP_S3_BUCKET`, `BACKUP_AWS_ACCESS_KEY_ID` /
   `BACKUP_AWS_SECRET_ACCESS_KEY` / `BACKUP_AWS_REGION`.
2. Confirm the target bucket has its own retention/versioning policy as
   a second layer — `db-backup.sh`'s pruning is a convenience, not a
   substitute for the storage provider's own lifecycle rules.
3. Run the weekly restore-verify job manually once via
   `workflow_dispatch` before trusting the schedule.

## Restoring in a real incident

```bash
# 1. Get the encrypted backup file (from S3, or a workflow artifact)
# 2. Decrypt and restore into the TARGET database (not a scratch one, this time):
BACKUP_ENCRYPTION_KEY=<key> RESTORE_TEST_DB_URL=<target-database-url> \
  ./scripts/db-restore-test.sh path/to/embr-<timestamp>.dump.gpg
```

`db-restore-test.sh` uses `pg_restore --clean --if-exists`, so it drops
and recreates existing objects in the target database — confirm the
target is actually where you intend to restore before running this
against anything that isn't a scratch database.

## What this doesn't cover

- Point-in-time recovery (PITR) — this is periodic full-dump backup, not
  continuous WAL archiving. If your managed Postgres provider (Railway,
  Fly, Supabase) offers PITR, treat that as the primary recovery
  mechanism for "restore to 10 minutes ago" and this script's backups as
  the independent, provider-agnostic second layer.
- Backing up Redis — acceptable for now since Redis here holds sessions
  and BullMQ job state, both reconstructable/re-enqueueable, not
  source-of-truth data.
