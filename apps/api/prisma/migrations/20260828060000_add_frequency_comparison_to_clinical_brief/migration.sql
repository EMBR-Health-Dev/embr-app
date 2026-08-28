-- AlterTable
-- Nullable, no default: existing clinical_briefs rows predate this
-- field and have no value to backfill (recomputing one would violate
-- ClinicalBrief's own point-in-time-snapshot invariant against data
-- that may no longer match what generation time saw). NULL for those
-- rows means "never computed for this brief" and is a deliberately
-- different value from an empty JSON array, which means the
-- comparison ran and found nothing — see schema.prisma's doc comment
-- on this column.
ALTER TABLE "clinical_briefs" ADD COLUMN "frequencyComparison" JSONB;
