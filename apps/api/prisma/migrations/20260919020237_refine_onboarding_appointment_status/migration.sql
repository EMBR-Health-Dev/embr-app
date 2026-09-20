-- Refine OnboardingAppointmentStatus's answer set for the onboarding
-- "appointment status" question. Two of the four options changed
-- meaning, not just wording (UNSURE_WHEN -> WAITING_TO_SCHEDULE, NO ->
-- NOT_NOW), and WITHIN_THREE_MONTHS_OR_LONGER is a genuinely new
-- bucket the old set didn't have. Postgres has no single statement for
-- "change an enum's value set," so this recreates the type and
-- remaps existing rows to their closest new equivalent via a CASE
-- expression, rather than a same-shape RENAME VALUE.
--
-- Remapping: WITHIN_MONTH stays itself (unchanged meaning). UNSURE_WHEN
-- ("yes, but not sure when") and the old catch-all UNSURE ("not sure
-- yet") both fold into WAITING_TO_SCHEDULE, the closest existing
-- meaning left in the new set: an appointment that isn't confirmed or
-- scheduled. NO becomes NOT_NOW (same meaning, softer phrasing).
CREATE TYPE "OnboardingAppointmentStatus_new" AS ENUM ('WITHIN_MONTH', 'WITHIN_THREE_MONTHS_OR_LONGER', 'WAITING_TO_SCHEDULE', 'NOT_NOW');

ALTER TABLE "onboarding_profiles"
  ALTER COLUMN "appointmentStatus" TYPE "OnboardingAppointmentStatus_new"
  USING (
    CASE "appointmentStatus"::text
      WHEN 'WITHIN_MONTH' THEN 'WITHIN_MONTH'
      WHEN 'UNSURE_WHEN' THEN 'WAITING_TO_SCHEDULE'
      WHEN 'NO' THEN 'NOT_NOW'
      WHEN 'UNSURE' THEN 'WAITING_TO_SCHEDULE'
      ELSE NULL
    END
  )::"OnboardingAppointmentStatus_new";

DROP TYPE "OnboardingAppointmentStatus";
ALTER TYPE "OnboardingAppointmentStatus_new" RENAME TO "OnboardingAppointmentStatus";
