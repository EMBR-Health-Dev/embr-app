-- Additive only: a new table for the appointment follow up question.

-- CreateEnum
CREATE TYPE "AppointmentOutcome" AS ENUM ('YES_SIGNIFICANTLY', 'YES_SOMEWHAT', 'NOT_REALLY', 'NO', 'NO_APPOINTMENT_YET');

-- CreateTable: "comment" holds ciphertext (field-crypto.ts).
CREATE TABLE "brief_feedback" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "AppointmentOutcome" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brief_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brief_feedback_briefId_key" ON "brief_feedback"("briefId");

-- CreateIndex
CREATE INDEX "brief_feedback_userId_idx" ON "brief_feedback"("userId");

-- CreateIndex
CREATE INDEX "brief_feedback_createdAt_idx" ON "brief_feedback"("createdAt");

-- AddForeignKey
ALTER TABLE "brief_feedback" ADD CONSTRAINT "brief_feedback_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "clinical_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_feedback" ADD CONSTRAINT "brief_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
