import type { SymptomLog } from "../../generated/prisma/index.js";
import type { SymptomLogDto } from "@embr/types";

export function toSymptomLogDto(log: SymptomLog): SymptomLogDto {
  return {
    id: log.id,
    category: log.category,
    severity: log.severity,
    occurredAt: log.occurredAt.toISOString(),
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}
