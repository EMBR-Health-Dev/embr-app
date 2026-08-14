import type { Treatment } from "../../generated/prisma/index.js";
import type { TreatmentCategory, TreatmentDto } from "@embr/types";

export function toTreatmentDto(treatment: Treatment): TreatmentDto {
  return {
    id: treatment.id,
    name: treatment.name,
    category: treatment.category as TreatmentCategory,
    startDate: treatment.startDate.toISOString().slice(0, 10),
    endDate: treatment.endDate ? treatment.endDate.toISOString().slice(0, 10) : null,
    notes: treatment.notes,
    createdAt: treatment.createdAt.toISOString(),
    updatedAt: treatment.updatedAt.toISOString(),
  };
}
