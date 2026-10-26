-- How hard she exercised that day, on a fixed scale. Null means not recorded.
CREATE TYPE "ExerciseLevel" AS ENUM ('NONE', 'LIGHT', 'MODERATE', 'VIGOROUS');

ALTER TABLE "context_logs" ADD COLUMN "exercise" "ExerciseLevel";
