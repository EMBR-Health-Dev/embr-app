import type {
  CreateSymptomLogInput,
  SaveSymptomCheckInInput,
  SymptomLogQuery,
  UpdateSymptomLogInput,
} from "@embr/validation";
import type { PaginatedResponse, SymptomCheckInDto, SymptomLogDto } from "@embr/types";
import { AppError } from "@embr/shared";
import { symptomRepository } from "./symptom.repository.js";
import { toSymptomLogDto } from "./symptom.mappers.js";
import { paginate } from "../../lib/pagination.js";
import { isValidTimeZone } from "../trends/symptom-history.js";
import { checkInDateStatus, checkInOccurredAt, toDateColumn } from "./symptom-check-in.js";

function toCheckInDto(
  date: string,
  logs: Array<{ id: string; category: string; severity: string; occurredAt: Date }>,
): SymptomCheckInDto {
  return {
    date,
    entries: logs.map((log) => ({
      id: log.id,
      category: log.category as SymptomCheckInDto["entries"][number]["category"],
      severity: log.severity as SymptomCheckInDto["entries"][number]["severity"],
      occurredAt: log.occurredAt.toISOString(),
    })),
  };
}

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

  async getCheckIn(userId: string, date: string): Promise<SymptomCheckInDto> {
    return toCheckInDto(date, await symptomRepository.findCheckIn(userId, toDateColumn(date)));
  },

  async saveCheckIn(
    userId: string,
    date: string,
    input: SaveSymptomCheckInInput,
    now: Date = new Date(),
  ): Promise<SymptomCheckInDto> {
    if (!isValidTimeZone(input.timeZone)) {
      throw AppError.validation(`Unknown time zone: ${input.timeZone}`);
    }
    const status = checkInDateStatus(date, input.timeZone, now);
    if (status === "future") throw AppError.validation("A check in cannot be for a future date");
    if (status === "too_old") {
      throw AppError.validation("A check in can only be saved for today or yesterday");
    }
    const logs = await symptomRepository.saveCheckIn(
      userId,
      toDateColumn(date),
      input.entries,
      checkInOccurredAt(date, input.timeZone, now),
    );
    return toCheckInDto(date, logs);
  },

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await symptomRepository.delete(userId, id);
    if (!deleted) throw AppError.notFound("Symptom log");
  },
};
