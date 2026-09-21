-- CreateEnum
CREATE TYPE "SleepDurationBucket" AS ENUM ('UNDER_6H', 'SIX_TO_SEVEN_H', 'SEVEN_PLUS_H');

-- CreateEnum
CREATE TYPE "StressLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateTable
CREATE TABLE "context_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sleepDuration" "SleepDurationBucket",
    "caffeineAfternoon" BOOLEAN,
    "alcohol" BOOLEAN,
    "stressLevel" "StressLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_logs_userId_date_idx" ON "context_logs"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "context_logs_userId_date_key" ON "context_logs"("userId", "date");

-- AddForeignKey
ALTER TABLE "context_logs" ADD CONSTRAINT "context_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
