import type {
  AuditLogDto,
  AuthSessionResponse,
  DeviceSessionDto,
  MyOrganizationMembershipDto,
  OrganizationMemberDto,
  OrganizationInviteDto,
  OrgSymptomFrequencyDto,
  PaginatedResponse,
  UserDto,
} from "@embr/types";
import { apiFetch } from "./api-client";

export const api = {
  auth: {
    login: (input: { email: string; password: string }) =>
      apiFetch<AuthSessionResponse>("/auth/login", { method: "POST", body: input }),

    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),

    logoutAll: () => apiFetch<void>("/auth/logout-all", { method: "POST" }),

    me: () => apiFetch<UserDto>("/auth/me"),

    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>("/auth/change-password", { method: "POST", body: input }),

    sessions: {
      list: () => apiFetch<DeviceSessionDto[]>("/auth/sessions"),
      revoke: (id: string) => apiFetch<void>(`/auth/sessions/${id}`, { method: "DELETE" }),
    },
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

  organizations: {
    my: () => apiFetch<MyOrganizationMembershipDto[]>("/organizations/me"),

    members: (organizationId: string, query?: { page?: number; pageSize?: number }) =>
      apiFetch<PaginatedResponse<OrganizationMemberDto>>(
        `/organizations/${organizationId}/members`,
        { query },
      ),

    inviteMember: (organizationId: string, input: { email: string; role?: string }) =>
      apiFetch<OrganizationInviteDto>(`/organizations/${organizationId}/invites`, {
        method: "POST",
        body: input,
      }),

    revokeMember: (organizationId: string, userId: string) =>
      apiFetch<void>(`/organizations/${organizationId}/members/${userId}`, { method: "DELETE" }),

    symptomFrequency: (organizationId: string, query?: { from?: string; to?: string }) =>
      apiFetch<OrgSymptomFrequencyDto>(
        `/organizations/${organizationId}/trends/symptom-frequency`,
        { query },
      ),
  },
};
