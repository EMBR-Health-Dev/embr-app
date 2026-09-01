import type { CreateTreatmentInput, TreatmentQuery, UpdateTreatmentInput } from "@embr/validation";
import type { PaginatedResponse, TreatmentDto, TreatmentImpactDto } from "@embr/types";
import { AppError } from "@embr/shared";
import { treatmentRepository } from "./treatment.repository.js";
import { toTreatmentDto } from "./treatment.mappers.js";
import { paginate } from "../../lib/pagination.js";
import { buildTreatmentImpact, computeTreatmentImpactWindows } from "./treatment-impact.js";

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

  /** See treatment-impact.ts for the deterministic window/comparison
   * logic itself — this just wires ownership-scoped data into it,
   * same "fetch, then hand off to a pure function" shape
   * trends.service.ts already uses for cycle length / co-occurrence. */
  async getImpact(userId: string, id: string): Promise<TreatmentImpactDto> {
    const treatment = await treatmentRepository.findById(userId, id);
    if (!treatment) throw AppError.notFound("Treatment");

    // Same UTC-midnight-truncated "today" convention as
    // treatmentRepository.list()'s active filter — see that fix's own
    // doc comment for why a bare `new Date()` is the wrong thing to
    // compare @db.Date columns against.
    const today = new Date(new Date().toISOString().slice(0, 10));
    const windows = computeTreatmentImpactWindows({
      startDate: treatment.startDate,
      endDate: treatment.endDate,
      today,
    });

    const { beforeLogCount, afterLogCount } = await treatmentRepository.countSymptomLogsInWindows(
      userId,
      windows,
    );

    return buildTreatmentImpact({
      treatmentId: treatment.id,
      startDate: treatment.startDate,
      endDate: treatment.endDate,
      today,
      beforeLogCount,
      afterLogCount,
    });
  },
};
