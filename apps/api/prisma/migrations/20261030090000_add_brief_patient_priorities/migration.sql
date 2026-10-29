-- Up to three things she most wants her clinician to understand, printed
-- first in the BRIEF. Stored encrypted by the API; null for earlier briefs.
ALTER TABLE "clinical_briefs" ADD COLUMN "patientPriorities" JSONB;
