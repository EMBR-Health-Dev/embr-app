import type { PaginatedResponse } from "@embr/types";
import type { PaginationQuery } from "@embr/validation";

/** Converts a validated {page, pageSize} query into Prisma's skip/take. */
export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginate<T>(
  items: T[],
  total: number,
  { page, pageSize }: PaginationQuery,
): PaginatedResponse<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
