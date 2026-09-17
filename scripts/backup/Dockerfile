# syntax=docker/dockerfile:1
#
# Minimal image for the embr-db-backup Railway cron service. Runs
# scripts/db-backup.sh unchanged, once daily, against the private
# Postgres instance over Railway's private network — never a public
# endpoint. Base image is the official Postgres 18 Alpine build so
# pg_dump's version always matches the production server's major
# version (currently ghcr.io/railwayapp-templates/postgres-ssl:18) —
# see db-restore-test.sh's own comment on why client/server version
# skew matters here.
FROM postgres:18-alpine

# bash: db-backup.sh's shebang. gnupg: encrypts the dump at rest.
# aws-cli: uploads to the S3-compatible Railway Bucket (see
# AWS_ENDPOINT_URL in the service's variables — Alpine's aws-cli is
# 2.15+, which natively supports that env var, so db-backup.sh needed
# no changes for this).
RUN apk add --no-cache bash gnupg aws-cli

WORKDIR /app
COPY scripts/db-backup.sh ./db-backup.sh
RUN chmod +x ./db-backup.sh

# Railway cron: runs this command on the schedule, expects it to exit
# when done — db-backup.sh already does, unchanged.
CMD ["./db-backup.sh"]
