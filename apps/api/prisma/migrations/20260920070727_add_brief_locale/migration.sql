-- CreateEnum
CREATE TYPE "BriefLocale" AS ENUM ('en', 'ja');

-- AlterTable
ALTER TABLE "clinical_briefs" ADD COLUMN     "locale" "BriefLocale" NOT NULL DEFAULT 'en';
