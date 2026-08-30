-- AlterTable
-- Nullable, no default — same reasoning as the four prior additive
-- migrations on this table: existing clinical_briefs rows predate
-- this field and have no value to backfill (recomputing one would
-- violate ClinicalBrief's point-in-time-snapshot invariant, and this
-- is exactly the case the invariant exists to protect against: the
-- canonical Stage 4 result must reflect what generation time actually
-- produced, not a reinterpretation applied after the fact).
ALTER TABLE "clinical_briefs" ADD COLUMN "interpretation" JSONB;
