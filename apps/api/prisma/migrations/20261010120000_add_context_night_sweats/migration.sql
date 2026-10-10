-- CreateEnum
CREATE TYPE "NightSweatsRecall" AS ENUM ('NONE', 'ONE', 'TWO_TO_THREE', 'FOUR_PLUS');

-- AlterTable: nullable, so existing rows stay "not recorded".
ALTER TABLE "context_logs" ADD COLUMN "nightSweats" "NightSweatsRecall";
