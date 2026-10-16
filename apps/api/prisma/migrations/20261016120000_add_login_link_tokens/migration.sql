-- Single use links to sign in without a password. Same shape as
-- password_reset_tokens: only the hash is stored.
CREATE TABLE "login_link_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_link_tokens_tokenHash_key" ON "login_link_tokens"("tokenHash");

CREATE INDEX "login_link_tokens_userId_idx" ON "login_link_tokens"("userId");

ALTER TABLE "login_link_tokens" ADD CONSTRAINT "login_link_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
