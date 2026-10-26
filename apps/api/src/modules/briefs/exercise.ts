import type { ExerciseLevel, ExerciseSummaryDto } from "@embr/types";

/** Below this many answered days the brief states only how many days
 * were answered, never a breakdown, so three or four answers never read
 * as a pattern. Same threshold as work impact and night sweats. */
export const EXERCISE_BREAKDOWN_MIN_DAYS = 7;

const LEVELS: ExerciseLevel[] = ["NONE", "LIGHT", "MODERATE", "VIGOROUS"];

/** Deterministic count of the daily exercise answers in a brief's range.
 * Only answered days count: a day with no answer is "not logged", never
 * "none". Shown in the person's own BRIEF; never sent to the AI. */
export function summarizeExercise(answers: Array<ExerciseLevel | null>): ExerciseSummaryDto {
  const answered = answers.filter((a): a is ExerciseLevel => a !== null);
  if (answered.length < EXERCISE_BREAKDOWN_MIN_DAYS) {
    return { daysAnswered: answered.length, breakdown: null };
  }
  const breakdown = Object.fromEntries(LEVELS.map((l) => [l, 0])) as Record<ExerciseLevel, number>;
  for (const a of answered) breakdown[a] += 1;
  return { daysAnswered: answered.length, breakdown };
}
