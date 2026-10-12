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
- `.github/workflows/backup.yml` — **disabled from its daily/weekly
  schedule, `workflow_dispatch`-only now.** It predates the
  private-Postgres discovery: a GitHub-hosted runner has no route to
  `postgres.railway.internal`, so `PRODUCTION_DATABASE_URL` was never
  actually reachable from it — every scheduled run failed immediately,
  every day, for a reason no secret could fix. Left runnable manually
  (for a future environment where the target really is reachable from a
  runner) rather than deleted, but the schedule that produced daily
  false-failure noise is gone.

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

## Setup checklist for the manual-only GitHub Actions path (`backup.yml`)

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

## Restore drills

A backup counts only once it has been restored. Record every drill here.

| Date            | Backup restored                                                       | Result                                                                                                                                    | Rows restored                                                                                                         |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 12 October 2026 | `embr-20261012T030234Z.dump.gpg` (the 03:02 UTC run that day, 36 KiB) | **Passed**: downloaded from the bucket, decrypted with `BACKUP_ENCRYPTION_KEY`, restored with no `pg_restore` errors, sanity check passed | 6 users, 37 symptom logs, 5 cycle entries, 2 daily context entries, 0 treatments, 1 note, 6 BRIEFs, 6 consent records |

**How the 12 October drill ran.** A temporary Railway service built from
`scripts/backup/Dockerfile`, with `restore-drill.sh` as its start command,
the backup service's bucket credentials and encryption key passed in as
Railway variable references (never copied out of Railway), and
`RESTORE_TEST_DB_URL` pointing at a temporary Postgres 18 service in the
same project. The production database was not read or touched.
Afterwards both temporary services (`restore-drill`, `Postgres-a4Pc`) and
the scratch database's volume (`postgres-volume-s5AH`) were staged for
deletion; Railway applies deletions only after two factor confirmation in
the dashboard. The restored copy is health data and must not be left
behind, so confirm the deletion is applied before closing a drill.

**To repeat it**, quarterly and after any change to the backup scripts or
the Postgres version:

1. Add a Postgres service from Railway's template (a scratch database).
2. Add an empty service, set its Dockerfile path to
   `/scripts/backup/Dockerfile`, restart policy to never, and start
   command to `./restore-drill.sh`.
3. Set its variables as references: `BACKUP_ENCRYPTION_KEY`,
   `BACKUP_S3_BUCKET` and the four `AWS_*` variables from the backup
   service, and `RESTORE_TEST_DB_URL` from the scratch database's
   `DATABASE_URL`.
4. Connect the repository; the deploy runs the drill. Read its logs for
   "Restore test passed".
5. Delete both services and the scratch database's volume. Railway asks
   for two factor confirmation in the dashboard to apply the deletions.
6. Add a row to the table above.

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
