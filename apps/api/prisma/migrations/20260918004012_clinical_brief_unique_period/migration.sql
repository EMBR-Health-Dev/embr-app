-- CreateIndex
CREATE UNIQUE INDEX "clinical_briefs_userId_fromDate_toDate_key" ON "clinical_briefs"("userId", "fromDate", "toDate");
