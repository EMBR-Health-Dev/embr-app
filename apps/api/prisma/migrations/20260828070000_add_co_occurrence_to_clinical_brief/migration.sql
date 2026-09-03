-- AlterTable
-- Nullable, no default — same reasoning as frequencyComparison's own
-- migration: existing clinical_briefs rows predate this field and
-- have no value to backfill (recomputing one would violate
-- ClinicalBrief's point-in-time-snapshot invariant). See
-- schema.prisma's doc comment on this column for why, unlike
-- frequencyComparison, NULL here is not further distinguished between
-- "never computed" and "computed, no qualifying pair."
ALTER TABLE "clinical_briefs" ADD COLUMN "coOccurrence" JSONB;
