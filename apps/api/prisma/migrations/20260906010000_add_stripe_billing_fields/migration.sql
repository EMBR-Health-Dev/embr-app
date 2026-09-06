-- Confirmed missing during the database-integrity audit, not a new
-- schema change: `stripeCustomerId`, `stripeSubscriptionId`,
-- `subscriptionStatus`, `currentPeriodEnd` on Organization, the
-- StripeSubscriptionStatus enum, and the entire StripeWebhookEvent
-- model have existed in schema.prisma since commit cde6fce ("feat:
-- add Stripe billing and seat purchase flow"), but that commit only
-- edited schema.prisma — it never generated a migration, under the
-- same "generate/migrate blocked in this sandbox" constraint noted
-- explicitly by an earlier, unrelated commit (7da32d4) touching
-- ClinicalBrief.treatmentSummary. Every other schema change in this
-- repository's history has a corresponding dated migration; this is
-- the one exception. Confirmed by direct inspection, not assumed: grepped
-- every committed migration.sql for "stripe_webhook_events",
-- "StripeWebhookEvent", and "stripeCustomerId" and found zero matches
-- anywhere. Running `prisma migrate deploy` against a fresh database
-- using only the migrations that existed before this one would create
-- an `organizations` table with no billing columns at all and no
-- `stripe_webhook_events` table — every billing route and the webhook
-- handler would fail immediately with "column/relation does not
-- exist," a complete, silent failure of the entire billing feature on
-- any environment that deploys via the project's own official,
-- CI-verified mechanism (`prisma migrate deploy`; see ci.yml, which
-- explicitly guards against an empty migrations directory).
--
-- Safe to insert here, after every existing migration, despite the
-- schema change chronologically predating several of them: confirmed
-- via docs/MIGRATION-AUDIT.md that no real (non-local, non-CI-
-- throwaway) database has ever had any migration in this history
-- applied to it, so there is no existing deployment whose applied-
-- migrations record this could conflict with.

-- CreateEnum
CREATE TYPE "StripeSubscriptionStatus" AS ENUM ('INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'PAUSED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "subscriptionStatus" "StripeSubscriptionStatus",
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeSubscriptionId_key" ON "organizations"("stripeSubscriptionId");
