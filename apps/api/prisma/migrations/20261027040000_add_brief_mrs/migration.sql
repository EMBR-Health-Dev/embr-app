-- The BRIEF's Menopause Rating Scale summary. Null means the brief
-- predates the field or the MRS check-in was switched off.
ALTER TABLE "clinical_briefs" ADD COLUMN "mrs" JSONB;
