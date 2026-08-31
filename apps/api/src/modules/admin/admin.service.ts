import type { AdminAuditLogQuery, AdminUserQuery } from "@embr/validation";
import type { AuditLogDto, PaginatedResponse, UserDto } from "@embr/types";
import type { User } from "../../generated/prisma/index.js";
import { adminRepository } from "./admin.repository.js";
import { toAuditLogDto } from "./admin.mappers.js";
import { toUserDto } from "../auth/auth.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const adminService = {
  async listUsers(query: AdminUserQuery): Promise<PaginatedResponse<UserDto>> {
    const { items, total } = await adminRepository.listUsers(query);
    // Not items.map(toUserDto) directly -- Array.map calls its callback
    // with (element, index, array), and toUserDto's second parameter
    // (onboardingCompletedAt) would silently receive the numeric index
    // instead of its intended default, throwing the moment the mapper
    // tries to call .toISOString() on a number.
    //
    // `user: User` is explicit rather than left to inference because
    // adminRepository.listUsers has no declared return type of its own
    // — it's inferred from `prisma.user.findMany(...)`, which only
    // resolves to a real type once the generated Prisma client exists.
    // toUserDto already expects exactly this type as its first
    // parameter (see auth.mappers.ts), so this doesn't introduce a new
    // type, just makes the existing one explicit at the one point that
    // needs it.
    return paginate(
      items.map((user: User) => toUserDto(user)),
      total,
      query,
    );
  },

  async listAuditLogs(query: AdminAuditLogQuery): Promise<PaginatedResponse<AuditLogDto>> {
    const { items, total } = await adminRepository.listAuditLogs(query);
    return paginate(items.map(toAuditLogDto), total, query);
  },
};
