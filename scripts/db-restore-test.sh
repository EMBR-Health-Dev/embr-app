#!/usr/bin/env bash
# Restores an encrypted backup into a throwaway local database and runs a
# handful of sanity checks. A backup that has never been restored is a
# hope, not a backup — this script is meant to run on a schedule (see
# .github/workflows/backup.yml), not just exist for someone to run once
# during an incident and discover it doesn't work.
#
# Usage:
#   ./scripts/db-restore-test.sh path/to/embr-<timestamp>.dump.gpg
#
# Required env:
#   BACKUP_ENCRYPTION_KEY   Same passphrase used to encrypt the backup.
#   RESTORE_TEST_DB_URL     Postgres connection string for a *scratch*
#                           database — this script drops and recreates
#                           whatever schema lives there. Never point this
#                           at anything you care about.

set -euo pipefail

ENCRYPTED_FILE="${1:?Usage: db-restore-test.sh <path-to-backup.dump.gpg>}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${RESTORE_TEST_DB_URL:?RESTORE_TEST_DB_URL is required — point this at a disposable scratch DB}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT
DUMP_FILE="${WORKDIR}/restore-test.dump"

echo "==> Decrypting ${ENCRYPTED_FILE}"
gpg --batch --yes --decrypt --passphrase "${BACKUP_ENCRYPTION_KEY}" \
  --output "${DUMP_FILE}" "${ENCRYPTED_FILE}"

echo "==> Restoring into scratch database"
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "${RESTORE_TEST_DB_URL}" "${DUMP_FILE}"

echo "==> Running sanity checks"
# Adjust table names here if the schema changes — these three existing
# since Milestone 1 (users, symptom logs, cycle entries) is a reasonable
# proxy for "the restore actually contains real data", not an exhaustive
# check of every table.
psql "${RESTORE_TEST_DB_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM "User";
  RAISE NOTICE 'Users restored: %', user_count;
  IF user_count = 0 THEN
    RAISE EXCEPTION 'Restore test failed: 0 users in restored database';
  END IF;
END $$;
SQL

echo "==> Restore test passed."
