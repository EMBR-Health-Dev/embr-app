-- Additive only. Existing briefs keep their AI wording and read as GENERATED.

-- CreateEnum
CREATE TYPE "BriefAiStatus" AS ENUM ('GENERATED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "BriefAiOutcome" AS ENUM ('ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "clinical_briefs" ADD COLUMN     "aiStatus" "BriefAiStatus" NOT NULL DEFAULT 'GENERATED';

-- CreateTable: no user id, brief id or text, counts and timings only.
CREATE TABLE "brief_ai_runs" (
    "id" TEXT NOT NULL,
    "outcome" "BriefAiOutcome" NOT NULL,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "locale" "BriefLocale" NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brief_ai_runs_createdAt_idx" ON "brief_ai_runs"("createdAt");
