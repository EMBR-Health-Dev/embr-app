import type { SocialImpact, SocialImpactSummaryDto } from "@embr/types";

/** Below this many answered days the brief states only how many days
 * were answered, never a breakdown. Same threshold as work impact. */
export const SOCIAL_IMPACT_BREAKDOWN_MIN_DAYS = 7;

const ANSWERS: SocialImpact[] = ["NONE", "DID_LESS", "MISSED_PLANS"];

/** Deterministic count of the "did symptoms affect time with family or
 * friends" answers in a brief's range. Only answered days count: a day
 * with no answer is "not logged", never "no". Shown only in the person's
 * own BRIEF: never sent to the AI and never part of any organisation
 * statistic. */
export function summarizeSocialImpact(answers: Array<SocialImpact | null>): SocialImpactSummaryDto {
  const answered = answers.filter((a): a is SocialImpact => a !== null);
  if (answered.length < SOCIAL_IMPACT_BREAKDOWN_MIN_DAYS) {
    return { daysAnswered: answered.length, breakdown: null };
  }
  const breakdown = Object.fromEntries(ANSWERS.map((a) => [a, 0])) as Record<SocialImpact, number>;
  for (const a of answered) breakdown[a] += 1;
  return { daysAnswered: answered.length, breakdown };
}
