-- Expand the closed symptom taxonomy after clinician feedback (October 2026):
-- painful sex is tracked apart from vaginal dryness, and mood goes beyond
-- anxiety with irritability, anger and low mood as separate symptoms.
-- Additive only: no existing row changes meaning.
ALTER TYPE "SymptomCategory" ADD VALUE 'ANGER' BEFORE 'OTHER';
ALTER TYPE "SymptomCategory" ADD VALUE 'IRRITABILITY' BEFORE 'OTHER';
ALTER TYPE "SymptomCategory" ADD VALUE 'LOW_MOOD' BEFORE 'OTHER';
ALTER TYPE "SymptomCategory" ADD VALUE 'PAINFUL_SEX' BEFORE 'OTHER';
