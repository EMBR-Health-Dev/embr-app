import type { ContextLog } from "../../generated/prisma/index.js";
import type { ContextLogDto } from "@embr/types";

export function toContextLogDto(entry: ContextLog): ContextLogDto {
  return {
    id: entry.id,
    // .toISOString().slice(0, 10) rather than the full timestamp —
    // this is a @db.Date column (a calendar day, not a point in
    // time), matching cycle.mappers.ts's identical reasoning.
    date: entry.date.toISOString().slice(0, 10),
    sleepDuration: entry.sleepDuration,
    caffeineAfternoon: entry.caffeineAfternoon,
    alcohol: entry.alcohol,
    stressLevel: entry.stressLevel,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
