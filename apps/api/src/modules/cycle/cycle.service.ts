import type {
  CycleEntryQuery,
  UpdateCycleEntryInput,
  UpsertCycleEntryInput,
} from "@embr/validation";
import type { CycleEntryDto, PaginatedResponse } from "@embr/types";
import { AppError } from "@embr/shared";
import { cycleRepository } from "./cycle.repository.js";
import { toCycleEntryDto } from "./cycle.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const cycleService = {
  async upsert(userId: string, input: UpsertCycleEntryInput): Promise<CycleEntryDto> {
    const entry = await cycleRepository.upsertByDate(userId, input);
    return toCycleEntryDto(entry);
  },

  async list(userId: string, query: CycleEntryQuery): Promise<PaginatedResponse<CycleEntryDto>> {
    const { items, total } = await cycleRepository.list(userId, query);
    return paginate(items.map(toCycleEntryDto), total, query);
  },

  async getById(userId: string, id: string): Promise<CycleEntryDto> {
    const entry = await cycleRepository.findById(userId, id);
    if (!entry) throw AppError.notFound("Cycle entry");
    return toCycleEntryDto(entry);
  },

  async update(userId: string, id: string, input: UpdateCycleEntryInput): Promise<CycleEntryDto> {
    const entry = await cycleRepository.update(userId, id, input);
    if (!entry) throw AppError.notFound("Cycle entry");
    return toCycleEntryDto(entry);
  },

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await cycleRepository.delete(userId, id);
    if (!deleted) throw AppError.notFound("Cycle entry");
  },
};
