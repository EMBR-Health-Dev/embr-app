-- Baseline check in: tell "none of these" apart from "skipped".
-- Additive: one column. Existing rows (none are expected, the feature has not
-- shipped) default to false, meaning "not known to have been answered".
-- The rule "a baseline that lists symptoms has answered" is enforced by the
-- request schema, because a CHECK constraint cannot see the symptoms table.
ALTER TABLE "baseline_check_ins" ADD COLUMN "symptomsAnswered" BOOLEAN NOT NULL DEFAULT false;
