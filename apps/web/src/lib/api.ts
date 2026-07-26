import type {
  AuthSessionResponse,
  CycleEntryDto,
  DeviceSessionDto,
  PaginatedResponse,
  SymptomLogDto,
  UserDto,
} from "@embr/types";
import { apiFetch } from "./api-client";

export const api = {
  auth: {
    register: (input: { email: string; password: string }) =>
      apiFetch<UserDto>("/auth/register", { method: "POST", body: input }),

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

  symptomLogs: {
    list: (query?: {
      page?: number;
      pageSize?: number;
      category?: string;
      from?: string;
      to?: string;
    }) => apiFetch<PaginatedResponse<SymptomLogDto>>("/symptom-logs", { query }),

    create: (input: { category: string; severity: string; occurredAt: string; notes?: string }) =>
      apiFetch<SymptomLogDto>("/symptom-logs", { method: "POST", body: input }),

    delete: (id: string) => apiFetch<void>(`/symptom-logs/${id}`, { method: "DELETE" }),
  },

  cycleEntries: {
    list: (query?: { page?: number; pageSize?: number; from?: string; to?: string }) =>
      apiFetch<PaginatedResponse<CycleEntryDto>>("/cycle-entries", { query }),

    upsert: (input: {
      date: string;
      flow?: string;
      isPeriodStart?: boolean;
      isPeriodEnd?: boolean;
      notes?: string;
    }) => apiFetch<CycleEntryDto>("/cycle-entries", { method: "POST", body: input }),
  },
};
