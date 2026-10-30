-- CreateEnum
CREATE TYPE "SocialImpact" AS ENUM ('NONE', 'DID_LESS', 'MISSED_PLANS');

-- AlterTable: nullable, so existing rows stay "not recorded".
ALTER TABLE "context_logs" ADD COLUMN "socialImpact" "SocialImpact";

-- AlterTable: nullable, so earlier briefs read as "never computed".
ALTER TABLE "clinical_briefs" ADD COLUMN "socialImpact" JSONB;
