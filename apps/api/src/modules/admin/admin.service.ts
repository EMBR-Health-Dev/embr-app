import type { AdminAuditLogQuery, AdminUserQuery } from "@embr/validation";
import type { AuditLogDto, PaginatedResponse, UserDto } from "@embr/types";
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
    return paginate(
      items.map((user) => toUserDto(user)),
      total,
      query,
    );
  },

  async listAuditLogs(query: AdminAuditLogQuery): Promise<PaginatedResponse<AuditLogDto>> {
    const { items, total } = await adminRepository.listAuditLogs(query);
    return paginate(items.map(toAuditLogDto), total, query);
  },
};
