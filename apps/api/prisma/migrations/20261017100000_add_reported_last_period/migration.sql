-- Self reported date of her last period, set in Settings. Nullable:
-- existing profiles stay unanswered.
ALTER TABLE "onboarding_profiles" ADD COLUMN "lastPeriodDate" DATE;
