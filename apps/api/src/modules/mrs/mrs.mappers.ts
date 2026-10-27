import type { MrsCheckIn } from "../../generated/prisma/index.js";
import type { MrsCheckInDto, MrsItem } from "@embr/types";
import { MRS_ITEMS } from "@embr/validation";
import { scoreMrs } from "./mrs-scoring.js";

export function mrsAnswers(row: MrsCheckIn): Record<MrsItem, number> {
  return Object.fromEntries(MRS_ITEMS.map((item) => [item, row[item]])) as Record<MrsItem, number>;
}

export function toMrsCheckInDto(row: MrsCheckIn): MrsCheckInDto {
  const answers = mrsAnswers(row);
  return {
    id: row.id,
    completedOn: row.completedOn.toISOString().slice(0, 10),
    locale: row.locale,
    instrumentVersion: row.instrumentVersion,
    answers,
    scores: scoreMrs(answers),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
