import type { MrsBand, MrsItem, MrsScoresDto } from "@embr/types";

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

/**
 * The published reference bands for each score (Heinemann et al. 2004,
 * table 6): the highest score in each band, in order. They come from a
 * German population sample, and the authors note scores run lower in
 * Asian samples, so they describe a score against that reference; they
 * do not grade her. Used only in the BRIEF, for the clinician.
 */
const BAND_UPPER_BOUNDS: Record<keyof MrsScoresDto, [number, number, number]> = {
  total: [4, 8, 16],
  somatic: [2, 4, 8],
  psychological: [1, 3, 6],
  urogenital: [0, 1, 3],
};

export function mrsBand(key: keyof MrsScoresDto, score: number): MrsBand {
  const [little, mild, moderate] = BAND_UPPER_BOUNDS[key];
  if (score <= little) return "NONE_OR_LITTLE";
  if (score <= mild) return "MILD";
  if (score <= moderate) return "MODERATE";
  return "SEVERE";
}

export function mrsBands(scores: MrsScoresDto): Record<keyof MrsScoresDto, MrsBand> {
  return {
    total: mrsBand("total", scores.total),
    somatic: mrsBand("somatic", scores.somatic),
    psychological: mrsBand("psychological", scores.psychological),
    urogenital: mrsBand("urogenital", scores.urogenital),
  };
}
