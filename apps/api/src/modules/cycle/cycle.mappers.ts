import type { CycleEntry } from "../../generated/prisma/index.js";
import type { CycleEntryDto } from "@embr/types";

export function toCycleEntryDto(entry: CycleEntry): CycleEntryDto {
  return {
    id: entry.id,
    // .toISOString().slice(0, 10) rather than the full timestamp — this
    // is a @db.Date column (a calendar day, not a point in time), so the
    // DTO should read as "2026-07-25", never carrying a time-of-day or
    // timezone component a client could misread as meaningful.
    date: entry.date.toISOString().slice(0, 10),
    flow: entry.flow,
    isPeriodStart: entry.isPeriodStart,
    isPeriodEnd: entry.isPeriodEnd,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
