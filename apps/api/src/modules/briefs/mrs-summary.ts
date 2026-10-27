import type { BriefMrsPointDto, BriefMrsSummaryDto, MrsItem } from "@embr/types";
import { mrsBands, scoreMrs } from "../mrs/mrs-scoring.js";

export interface MrsCheckInRow {
  completedOn: string;
  answers: Record<MrsItem, number>;
}

function point(row: MrsCheckInRow): BriefMrsPointDto {
  const scores = scoreMrs(row.answers);
  return { completedOn: row.completedOn, scores, bands: mrsBands(scores) };
}

/**
 * The Menopause Rating Scale for a BRIEF: how many check-ins fall in the
 * period, and the first and latest by date (the latest only when there
 * is more than one). Sums of her own answers and the published
 * reference band each sum falls in; nothing else is inferred. Never
 * sent to the AI.
 */
export function summarizeMrs(rows: MrsCheckInRow[]): BriefMrsSummaryDto {
  const sorted = [...rows].sort((a, b) => a.completedOn.localeCompare(b.completedOn));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    checkInsInPeriod: sorted.length,
    first: first ? point(first) : null,
    latest: last && sorted.length > 1 ? point(last) : null,
  };
}
