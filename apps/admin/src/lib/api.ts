import type { AuditLogDto, AuthSessionResponse, PaginatedResponse, UserDto } from "@embr/types";
import { apiFetch } from "./api-client";

export const api = {
  auth: {
    login: (input: { email: string; password: string }) =>
      apiFetch<AuthSessionResponse>("/auth/login", { method: "POST", body: input }),

    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),

    me: () => apiFetch<UserDto>("/auth/me"),
  },

  admin: {
    listUsers: (query?: { page?: number; pageSize?: number }) =>
      apiFetch<PaginatedResponse<UserDto>>("/admin/users", { query }),

    listAuditLogs: (query?: {
      page?: number;
      pageSize?: number;
      action?: string;
      userId?: string;
    }) => apiFetch<PaginatedResponse<AuditLogDto>>("/admin/audit-logs", { query }),
  },
};
