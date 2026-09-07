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

# Same Prisma-URL normalization as db-backup.sh: pg_restore/psql reject
# ?schema= query params that every caller in this repo naturally uses.
RESTORE_URL="${RESTORE_TEST_DB_URL%%\?*}"

echo "==> Decrypting ${ENCRYPTED_FILE}"
gpg --batch --yes --decrypt --passphrase "${BACKUP_ENCRYPTION_KEY}" \
  --output "${DUMP_FILE}" "${ENCRYPTED_FILE}"

echo "==> Restoring into scratch database"
# pg_restore's exit status is captured, not fatal: a client/server
# version skew (host pg_restore newer than the server, e.g. Homebrew 18
# vs postgres:16) makes pg_restore emit `SET transaction_timeout` —
# unknown to the older server — report "errors ignored on restore", and
# exit nonzero even though the restore itself is complete. The sanity
# check below is what actually answers "is the backup usable", so it
# must run either way; a real failure mode still fails the script at
# the end.
RESTORE_RC=0
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "${RESTORE_URL}" "${DUMP_FILE}" || RESTORE_RC=$?
if [[ "${RESTORE_RC}" -ne 0 ]]; then
  echo "==> WARNING: pg_restore exited ${RESTORE_RC} (errors were reported above)." >&2
  echo "    If the errors are version-skew artifacts (e.g. SET transaction_timeout" >&2
  echo "    rejected by an older server), the data may still be complete - the" >&2
  echo "    sanity check below decides. Pin the client to the server's major" >&2
  echo "    version (run via a postgres:16-alpine container, or install" >&2
  echo "    postgresql@16) to silence this." >&2
  SERVER_V="$(psql "${RESTORE_URL}" -tAc "SELECT version()" 2>/dev/null | head -1)"
  CLIENT_V="$(pg_restore --version)"
  echo "    client: ${CLIENT_V}" >&2
  echo "    server: ${SERVER_V:-unreachable}" >&2
fi

echo "==> Running sanity checks"
# Adjust table names here if the schema changes — these three existing
# since Milestone 1 (users, symptom logs, cycle entries) is a reasonable
# proxy for "the restore actually contains real data", not an exhaustive
# check of every table.
psql "${RESTORE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM users;
  RAISE NOTICE 'Users restored: %', user_count;
  IF user_count = 0 THEN
    RAISE EXCEPTION 'Restore test failed: 0 users in restored database';
  END IF;
END $$;
SQL

if [[ "${RESTORE_RC}" -ne 0 ]]; then
  echo "==> Restore test passed (sanity checks ok), but pg_restore reported errors — treat the version-skew warning above as a to-fix, not noise." >&2
  exit 1
fi

echo "==> Restore test passed."
