-- CreateEnum
CREATE TYPE "WorkImpact" AS ENUM ('NONE', 'DID_LESS', 'MISSED_TIME');

-- AlterTable: nullable, so existing rows stay "not recorded".
ALTER TABLE "context_logs" ADD COLUMN "workImpact" "WorkImpact";

-- AlterTable: nullable, so earlier briefs read as "never computed".
ALTER TABLE "clinical_briefs" ADD COLUMN "workImpact" JSONB;
