import type { NightSweatsRecall, NightSweatsRecallSummaryDto } from "@embr/types";

/** Below this many answered mornings the brief states only how many
 * mornings were answered, never a breakdown: a split of three or four
 * answers reads as a pattern it is not. */
export const NIGHT_SWEATS_BREAKDOWN_MIN_MORNINGS = 7;

const BUCKETS: NightSweatsRecall[] = ["NONE", "ONE", "TWO_TO_THREE", "FOUR_PLUS"];

/** Deterministic count of the morning night sweats answers in a
 * brief's range. Only answered mornings count: a day with no answer
 * is "not logged", never "none". Kept apart from symptom counts (no
 * NIGHT_SWEATS symptom rows are ever derived from it) and never sent
 * to the AI. */
export function summarizeNightSweatsRecall(
  answers: Array<NightSweatsRecall | null>,
): NightSweatsRecallSummaryDto {
  const answered = answers.filter((a): a is NightSweatsRecall => a !== null);
  if (answered.length < NIGHT_SWEATS_BREAKDOWN_MIN_MORNINGS) {
    return { morningsAnswered: answered.length, breakdown: null };
  }
  const breakdown = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<
    NightSweatsRecall,
    number
  >;
  for (const a of answered) breakdown[a] += 1;
  return { morningsAnswered: answered.length, breakdown };
}
