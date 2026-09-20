-- Adds two new OnboardingArea values (CYCLE, OTHER) alongside the
-- existing five. Purely additive — no existing value is renamed or
-- removed, so unlike the appointment-status migration this needs no
-- type recreation or data remapping, just two ADD VALUE statements.
ALTER TYPE "OnboardingArea" ADD VALUE 'CYCLE';
ALTER TYPE "OnboardingArea" ADD VALUE 'OTHER';
