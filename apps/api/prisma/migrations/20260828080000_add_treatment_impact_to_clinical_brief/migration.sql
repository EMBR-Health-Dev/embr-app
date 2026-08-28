-- AlterTable
-- Nullable, no default — same reasoning as frequencyComparison's and
-- coOccurrence's own migrations: existing clinical_briefs rows
-- predate this field and have no value to backfill (recomputing one
-- would violate ClinicalBrief's point-in-time-snapshot invariant).
-- Unlike coOccurrence, an empty JSON array here is a real, distinct
-- fact from NULL — see schema.prisma's doc comment on this column.
ALTER TABLE "clinical_briefs" ADD COLUMN "treatmentImpact" JSONB;
