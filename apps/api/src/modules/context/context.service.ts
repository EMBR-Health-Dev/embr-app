import type { ContextLogQuery, UpsertContextLogInput } from "@embr/validation";
import type { ContextLogDto, PaginatedResponse } from "@embr/types";
import { contextRepository } from "./context.repository.js";
import { toContextLogDto } from "./context.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const contextService = {
  async upsert(userId: string, input: UpsertContextLogInput): Promise<ContextLogDto> {
    const entry = await contextRepository.upsertByDate(userId, input);
    return toContextLogDto(entry);
  },

  async list(userId: string, query: ContextLogQuery): Promise<PaginatedResponse<ContextLogDto>> {
    const { items, total } = await contextRepository.list(userId, query);
    return paginate(items.map(toContextLogDto), total, query);
  },
};
