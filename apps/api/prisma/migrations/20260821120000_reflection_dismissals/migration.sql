-- CreateEnum
CREATE TYPE "ReflectionType" AS ENUM ('LOGGING_ACTIVITY', 'SYMPTOM_FREQUENCY', 'SYMPTOM_CO_OCCURRENCE', 'TREATMENT_CONTEXT');

-- CreateTable
CREATE TABLE "reflection_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReflectionType" NOT NULL,
    "dismissalKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reflection_dismissals_userId_idx" ON "reflection_dismissals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reflection_dismissals_userId_type_dismissalKey_key" ON "reflection_dismissals"("userId", "type", "dismissalKey");

-- AddForeignKey
ALTER TABLE "reflection_dismissals" ADD CONSTRAINT "reflection_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
