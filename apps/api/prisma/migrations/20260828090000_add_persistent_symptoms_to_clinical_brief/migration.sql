-- AlterTable
-- Nullable, no default — same reasoning as the three prior additive
-- migrations on this table: existing clinical_briefs rows predate
-- this field and have no value to backfill (recomputing one would
-- violate ClinicalBrief's point-in-time-snapshot invariant). An empty
-- JSON array here is a real, distinct fact from NULL — see
-- schema.prisma's doc comment on this column.
ALTER TABLE "clinical_briefs" ADD COLUMN "persistentSymptoms" JSONB;
