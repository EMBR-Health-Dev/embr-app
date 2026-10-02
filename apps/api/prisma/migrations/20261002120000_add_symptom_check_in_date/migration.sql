-- AlterTable: nullable, so every existing row is unaffected.
ALTER TABLE "symptom_logs" ADD COLUMN "checkInDate" DATE;

-- CreateIndex: NULLs are distinct in Postgres, so individually logged
-- symptoms (checkInDate NULL) are never constrained by this.
CREATE UNIQUE INDEX "symptom_logs_userId_category_checkInDate_key" ON "symptom_logs"("userId", "category", "checkInDate");
