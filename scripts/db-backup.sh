#!/usr/bin/env bash
# Dumps the production Postgres database, encrypts the dump at rest, and
# (optionally) uploads it to S3-compatible storage. Health data means an
# unencrypted backup sitting in a bucket is itself an incident, so
# encryption is not optional here the way it might be for other projects.
#
# Usage:
#   DATABASE_URL=... BACKUP_ENCRYPTION_KEY=... ./scripts/db-backup.sh
#
# Required env:
#   DATABASE_URL            Postgres connection string to back up.
#   BACKUP_ENCRYPTION_KEY   Symmetric passphrase used for gpg encryption.
#                           Generate with: openssl rand -base64 32
#                           Store this in your secrets manager — losing it
#                           means every backup taken with it is unrecoverable.
#
# Optional env (enables upload; without them the encrypted dump is left
# in ./backups/ for the caller to move themselves):
#   BACKUP_S3_BUCKET        e.g. s3://embr-backups
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION
#
# Optional env:
#   BACKUP_RETENTION_DAYS   Local + remote prune window. Default: 30.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required — generate with: openssl rand -base64 32}"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backups"
DUMP_FILE="${BACKUP_DIR}/embr-${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"

mkdir -p "${BACKUP_DIR}"

echo "==> Dumping database (custom format, compressed)"
# Custom format (-Fc) rather than plain SQL: supports parallel restore
# and selective table restore later, and is already gzip-compressed
# internally so we're not double-compressing on top of gpg.
pg_dump "${DATABASE_URL}" -Fc -f "${DUMP_FILE}"

echo "==> Encrypting dump"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase "${BACKUP_ENCRYPTION_KEY}" \
  --output "${ENCRYPTED_FILE}" "${DUMP_FILE}"
rm -f "${DUMP_FILE}"

DUMP_SIZE="$(du -h "${ENCRYPTED_FILE}" | cut -f1)"
echo "==> Encrypted backup ready: ${ENCRYPTED_FILE} (${DUMP_SIZE})"

if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "==> Uploading to ${BACKUP_S3_BUCKET}"
  aws s3 cp "${ENCRYPTED_FILE}" "${BACKUP_S3_BUCKET}/$(basename "${ENCRYPTED_FILE}")"

  echo "==> Pruning remote backups older than ${RETENTION_DAYS} days"
  cutoff_epoch=$(date -u -d "-${RETENTION_DAYS} days" +%s)
  aws s3 ls "${BACKUP_S3_BUCKET}/" | while read -r line; do
    file_date=$(echo "$line" | awk '{print $1}')
    file_name=$(echo "$line" | awk '{print $4}')
    [[ -z "$file_name" ]] && continue
    file_epoch=$(date -u -d "$file_date" +%s 2>/dev/null || echo 0)
    if [[ "$file_epoch" -lt "$cutoff_epoch" ]]; then
      echo "    pruning ${file_name}"
      aws s3 rm "${BACKUP_S3_BUCKET}/${file_name}"
    fi
  done
else
  echo "==> BACKUP_S3_BUCKET not set — leaving encrypted dump in ${BACKUP_DIR}"
fi

echo "==> Pruning local backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "embr-*.dump.gpg" -mtime "+${RETENTION_DAYS}" -delete

echo "==> Done."
