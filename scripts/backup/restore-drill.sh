#!/usr/bin/env bash
# Glue for running a real restore drill against the live backup bucket:
# downloads the most recent encrypted backup from BACKUP_S3_BUCKET, then
# hands it to db-restore-test.sh unchanged. Meant to run as this image's
# one-off startCommand on a temporary Railway service wired to the real
# bucket credentials and a disposable scratch Postgres via Railway's
# variable-reference syntax — never as the backup cron's own CMD.
#
# Required env: everything db-backup.sh's upload step and
# db-restore-test.sh already require (BACKUP_S3_BUCKET,
# AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_DEFAULT_REGION/
# AWS_ENDPOINT_URL, BACKUP_ENCRYPTION_KEY, RESTORE_TEST_DB_URL).

set -euo pipefail

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

echo "==> Listing ${BACKUP_S3_BUCKET}"
LATEST="$(aws s3 ls "${BACKUP_S3_BUCKET}/" | sort | tail -n1 | awk '{print $NF}')"
if [[ -z "${LATEST}" ]]; then
  echo "==> No objects found in ${BACKUP_S3_BUCKET}" >&2
  exit 1
fi

DOWNLOADED="${WORKDIR}/${LATEST}"
echo "==> Downloading ${LATEST}"
aws s3 cp "${BACKUP_S3_BUCKET}/${LATEST}" "${DOWNLOADED}"

exec "$(dirname "${BASH_SOURCE[0]}")/db-restore-test.sh" "${DOWNLOADED}"
