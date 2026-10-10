-- AlterTable: nullable, so earlier briefs read as "never computed".
ALTER TABLE "clinical_briefs" ADD COLUMN "nightSweatsRecall" JSONB;
