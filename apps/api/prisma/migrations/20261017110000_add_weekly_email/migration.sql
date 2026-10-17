-- Weekly email reminder: off until she turns it on in Settings.
ALTER TABLE "users" ADD COLUMN "weeklyEmailOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "weeklyEmailLastSentAt" TIMESTAMP(3);
