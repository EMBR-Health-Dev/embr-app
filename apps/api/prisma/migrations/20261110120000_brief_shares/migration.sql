-- Additive only: a new table for links that show one brief to a clinician.
-- tokenHash and codeHash hold SHA-256 hashes, never the token or code.

-- CreateTable
CREATE TABLE "brief_shares" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brief_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brief_shares_tokenHash_key" ON "brief_shares"("tokenHash");

-- CreateIndex
CREATE INDEX "brief_shares_briefId_idx" ON "brief_shares"("briefId");

-- CreateIndex
CREATE INDEX "brief_shares_userId_idx" ON "brief_shares"("userId");

-- AddForeignKey
ALTER TABLE "brief_shares" ADD CONSTRAINT "brief_shares_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "clinical_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brief_shares" ADD CONSTRAINT "brief_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

