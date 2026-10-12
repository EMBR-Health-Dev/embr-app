-- Self reported life stage, asked during onboarding and editable in
-- Settings. Nullable: existing profiles stay unanswered.
CREATE TYPE "LifeStage" AS ENUM ('PERIMENOPAUSE', 'POSTMENOPAUSE', 'NOT_SURE');

ALTER TYPE "OnboardingStep" ADD VALUE 'LIFE_STAGE' AFTER 'JOB_TO_BE_DONE';

ALTER TABLE "onboarding_profiles" ADD COLUMN "lifeStage" "LifeStage";
