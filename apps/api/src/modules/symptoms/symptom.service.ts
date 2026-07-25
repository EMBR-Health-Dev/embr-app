import type {
  CreateSymptomLogInput,
  SymptomLogQuery,
  UpdateSymptomLogInput,
} from "@embr/validation";
import type { PaginatedResponse, SymptomLogDto } from "@embr/types";
import { AppError } from "@embr/shared";
import { symptomRepository } from "./symptom.repository.js";
import { toSymptomLogDto } from "./symptom.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const symptomService = {
  async create(userId: string, input: CreateSymptomLogInput): Promise<SymptomLogDto> {
    const log = await symptomRepository.create(userId, input);
    return toSymptomLogDto(log);
  },

  async list(userId: string, query: SymptomLogQuery): Promise<PaginatedResponse<SymptomLogDto>> {
    const { items, total } = await symptomRepository.list(userId, query);
    return paginate(items.map(toSymptomLogDto), total, query);
  },

  async getById(userId: string, id: string): Promise<SymptomLogDto> {
    const log = await symptomRepository.findById(userId, id);
    if (!log) throw AppError.notFound("Symptom log");
    return toSymptomLogDto(log);
  },

  async update(userId: string, id: string, input: UpdateSymptomLogInput): Promise<SymptomLogDto> {
    const log = await symptomRepository.update(userId, id, input);
    if (!log) throw AppError.notFound("Symptom log");
    return toSymptomLogDto(log);
  },

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await symptomRepository.delete(userId, id);
    if (!deleted) throw AppError.notFound("Symptom log");
  },
};
