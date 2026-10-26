-- Anonymous record of each deleted account (two dates and one flag), so
-- week 4 retention keeps people who deleted their account in the
-- cohort. No user id, email or health content.
CREATE TABLE "deleted_accounts" (
    "id" TEXT NOT NULL,
    "signupDate" DATE NOT NULL,
    "deletedDate" DATE NOT NULL,
    "activeWeek4" BOOLEAN NOT NULL,

    CONSTRAINT "deleted_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deleted_accounts_signupDate_idx" ON "deleted_accounts"("signupDate");
