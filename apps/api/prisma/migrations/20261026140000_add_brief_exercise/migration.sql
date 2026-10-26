-- The BRIEF's exercise summary, counted from daily context. Null means
-- the brief predates the field.
ALTER TABLE "clinical_briefs" ADD COLUMN "exercise" JSONB;
