import type { MrsItem, MrsScoresDto } from "@embr/types";

/**
 * The three published Menopause Rating Scale subscales (Heinemann et
 * al., Health Qual Life Outcomes 2004;2:45). Each score is a plain sum
 * of her 0 to 4 answers; the total is the sum of the subscales. No
 * weighting and no interpretation happens here.
 */
export const MRS_SUBSCALES = {
  somatic: ["hotFlushes", "heartDiscomfort", "sleepProblems", "jointMuscular"],
  psychological: ["depressiveMood", "irritability", "anxiety", "exhaustion"],
  urogenital: ["sexualProblems", "bladderProblems", "vaginalDryness"],
} as const satisfies Record<Exclude<keyof MrsScoresDto, "total">, readonly MrsItem[]>;

function sum(answers: Record<MrsItem, number>, items: readonly MrsItem[]): number {
  return items.reduce((total, item) => total + answers[item], 0);
}

export function scoreMrs(answers: Record<MrsItem, number>): MrsScoresDto {
  const somatic = sum(answers, MRS_SUBSCALES.somatic);
  const psychological = sum(answers, MRS_SUBSCALES.psychological);
  const urogenital = sum(answers, MRS_SUBSCALES.urogenital);
  return { total: somatic + psychological + urogenital, somatic, psychological, urogenital };
}

/** The wording shown, per language. Recorded with every check-in so a
 * later change of wording is traceable. */
export const MRS_INSTRUMENT_VERSION = { en: "MRS-EN-2003" } as const;
