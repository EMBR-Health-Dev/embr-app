-- CreateEnum
CREATE TYPE "TreatmentStopReason" AS ENUM ('SIDE_EFFECTS', 'LONG_TERM_CONCERN', 'NO_LONGER_NEEDED', 'COST', 'OTHER', 'PREFER_NOT_TO_SAY');

-- AlterTable: nullable, so existing treatments read as "not answered".
ALTER TABLE "treatments" ADD COLUMN "stopReason" "TreatmentStopReason";
