import type { CreateTreatmentInput, TreatmentQuery, UpdateTreatmentInput } from "@embr/validation";
import type { PaginatedResponse, TreatmentDto } from "@embr/types";
import { AppError } from "@embr/shared";
import { treatmentRepository } from "./treatment.repository.js";
import { toTreatmentDto } from "./treatment.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const treatmentService = {
  async create(userId: string, input: CreateTreatmentInput): Promise<TreatmentDto> {
    const treatment = await treatmentRepository.create(userId, input);
    return toTreatmentDto(treatment);
  },

  async list(userId: string, query: TreatmentQuery): Promise<PaginatedResponse<TreatmentDto>> {
    const { items, total } = await treatmentRepository.list(userId, query);
    return paginate(items.map(toTreatmentDto), total, query);
  },

  async getById(userId: string, id: string): Promise<TreatmentDto> {
    const treatment = await treatmentRepository.findById(userId, id);
    if (!treatment) throw AppError.notFound("Treatment");
    return toTreatmentDto(treatment);
  },

  async update(userId: string, id: string, input: UpdateTreatmentInput): Promise<TreatmentDto> {
    // The schema's own endDate>=startDate refinement only catches a
    // request that supplies both fields inconsistently — a partial
    // update touching just one of the two can't validate against the
    // other from the request body alone, since it isn't in it. Fetch
    // the existing record first whenever exactly one of the two dates
    // is being changed, and check the combined result before writing.
    if (
      (input.startDate !== undefined) !== (input.endDate !== undefined) &&
      (input.startDate !== undefined || input.endDate !== undefined)
    ) {
      const existing = await treatmentRepository.findById(userId, id);
      if (!existing) throw AppError.notFound("Treatment");

      const effectiveStart = input.startDate ?? existing.startDate;
      const effectiveEnd = input.endDate !== undefined ? input.endDate : existing.endDate;
      if (effectiveEnd && effectiveEnd < effectiveStart) {
        throw AppError.validation("endDate cannot be before startDate");
      }
    }

    const treatment = await treatmentRepository.update(userId, id, input);
    if (!treatment) throw AppError.notFound("Treatment");
    return toTreatmentDto(treatment);
  },

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await treatmentRepository.delete(userId, id);
    if (!deleted) throw AppError.notFound("Treatment");
  },
};
