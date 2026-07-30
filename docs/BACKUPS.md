# Database Backups

## What exists

- `scripts/db-backup.sh` — dumps Postgres (`pg_dump -Fc`), encrypts the
  dump with AES256 (gpg symmetric), optionally uploads to S3-compatible
  storage, and prunes anything older than the retention window (default
  30 days).
- `scripts/db-restore-test.sh` — decrypts a backup and restores it into a
  scratch database, then sanity-checks that it actually contains data.
- `.github/workflows/backup.yml` — runs `db-backup.sh` daily at 03:00 UTC,
  and runs a fresh backup + `db-restore-test.sh` weekly (Mondays, 04:00
  UTC) against a disposable Postgres service container.

## Why encryption isn't optional here

This is health data. A backup is a full copy of the database sitting
somewhere outside the access controls the running application enforces —
an unencrypted backup in a bucket is a second attack surface with none of
the app's authentication/authorization in front of it. `BACKUP_ENCRYPTION_KEY`
being a real, unique secret (not a placeholder) matters as much as any
other production credential in this repo.

## Setup checklist (before this runs against real production data)

1. Generate the encryption key once and store it in GitHub Actions
   Secrets, never in this repo:
   ```bash
   openssl rand -base64 32
   ```
2. Set these repo secrets (Settings → Secrets and variables → Actions):
   - `PRODUCTION_DATABASE_URL`
   - `BACKUP_ENCRYPTION_KEY`
   - `BACKUP_S3_BUCKET` (optional — e.g. `s3://embr-backups`; without
     this the encrypted dump stays local to the CI runner's `backups/`
     dir and is discarded when the job ends, which is not durable — set
     this before relying on the daily job for real recovery)
   - `BACKUP_AWS_ACCESS_KEY_ID` / `BACKUP_AWS_SECRET_ACCESS_KEY` /
     `BACKUP_AWS_REGION` (only if using S3)
3. Confirm the bucket (if used) has its own retention/versioning policy
   as a second layer — `db-backup.sh`'s pruning is a convenience, not a
   substitute for the storage provider's own lifecycle rules.
4. Run the weekly restore-verify job manually once via
   `workflow_dispatch` before trusting the schedule — confirms the whole
   chain (dump → encrypt → decrypt → restore → sanity check) actually
   works end to end in this environment before waiting a week to find
   out.

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
