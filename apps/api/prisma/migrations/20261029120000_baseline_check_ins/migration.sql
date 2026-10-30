-- Baseline check in: her first check in, saved once to her account.
-- Additive only: one enum, two tables, no change to existing tables.
-- One per account (unique userId); both tables cascade with the user,
-- so account deletion removes them. See docs/planning/baseline-check-in.md.

-- CreateEnum
CREATE TYPE "RecallFrequency" AS ENUM ('FEW_DAYS', 'HALF_THE_DAYS', 'MOST_DAYS');

-- CreateTable
CREATE TABLE "baseline_check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedOn" DATE NOT NULL,
    "timeZone" TEXT NOT NULL,
    "recallDays" SMALLINT NOT NULL DEFAULT 14,
    "locale" "BriefLocale" NOT NULL,
    "goal" "OnboardingJobToBeDone",
    "sleepDuration" "SleepDurationBucket",
    "workImpact" "WorkImpact",
    "healthConsentVersion" TEXT NOT NULL,
    "healthConsentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baseline_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baseline_check_in_symptoms" (
    "id" TEXT NOT NULL,
    "baselineCheckInId" TEXT NOT NULL,
    "category" "SymptomCategory" NOT NULL,
    "severity" "SeverityLevel",
    "frequency" "RecallFrequency",

    CONSTRAINT "baseline_check_in_symptoms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "baseline_check_ins_userId_key" ON "baseline_check_ins"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "baseline_check_in_symptoms_baselineCheckInId_category_key" ON "baseline_check_in_symptoms"("baselineCheckInId", "category");

-- AddForeignKey
ALTER TABLE "baseline_check_ins" ADD CONSTRAINT "baseline_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baseline_check_in_symptoms" ADD CONSTRAINT "baseline_check_in_symptoms_baselineCheckInId_fkey" FOREIGN KEY ("baselineCheckInId") REFERENCES "baseline_check_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The questions name a two week window; refuse anything outside a sane range.
ALTER TABLE "baseline_check_ins" ADD CONSTRAINT "baseline_check_ins_recall_days_check" CHECK ("recallDays" BETWEEN 1 AND 90);
