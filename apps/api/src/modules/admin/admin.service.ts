import type { AdminAuditLogQuery, AdminUserQuery } from "@embr/validation";
import type { AuditLogDto, PaginatedResponse, UserDto } from "@embr/types";
import { adminRepository } from "./admin.repository.js";
import { toAuditLogDto } from "./admin.mappers.js";
import { toUserDto } from "../auth/auth.mappers.js";
import { paginate } from "../../lib/pagination.js";

export const adminService = {
  async listUsers(query: AdminUserQuery): Promise<PaginatedResponse<UserDto>> {
    const { items, total } = await adminRepository.listUsers(query);
    return paginate(items.map(toUserDto), total, query);
  },

  async listAuditLogs(query: AdminAuditLogQuery): Promise<PaginatedResponse<AuditLogDto>> {
    const { items, total } = await adminRepository.listAuditLogs(query);
    return paginate(items.map(toAuditLogDto), total, query);
  },
};
