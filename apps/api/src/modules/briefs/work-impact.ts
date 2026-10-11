import type { WorkImpact, WorkImpactSummaryDto } from "@embr/types";

/** Below this many answered days the brief states only how many days
 * were answered, never a breakdown: a split of three or four answers
 * reads as a pattern it is not. Same threshold as night sweats recall. */
export const WORK_IMPACT_BREAKDOWN_MIN_DAYS = 7;

const ANSWERS: WorkImpact[] = ["NONE", "DID_LESS", "MISSED_TIME"];

/** Deterministic count of the "did symptoms affect work" answers in a
 * brief's range. Only answered days count: a day with no answer is
 * "not logged", never "no". Shown only in the person's own BRIEF:
 * never sent to the AI and never part of any organisation statistic. */
export function summarizeWorkImpact(answers: Array<WorkImpact | null>): WorkImpactSummaryDto {
  const answered = answers.filter((a): a is WorkImpact => a !== null);
  if (answered.length < WORK_IMPACT_BREAKDOWN_MIN_DAYS) {
    return { daysAnswered: answered.length, breakdown: null };
  }
  const breakdown = Object.fromEntries(ANSWERS.map((a) => [a, 0])) as Record<WorkImpact, number>;
  for (const a of answered) breakdown[a] += 1;
  return { daysAnswered: answered.length, breakdown };
}
