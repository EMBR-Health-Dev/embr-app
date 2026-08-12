import type { AuthSessionResponse, PaginatedResponse, SymptomLogDto, UserDto } from "@embr/types";
import { apiFetch } from "./api-client";

export const api = {
  auth: {
    register: (input: { email: string; password: string }) =>
      apiFetch<UserDto>("/auth/register", { method: "POST", body: input }),

    login: (input: { email: string; password: string }) =>
      apiFetch<AuthSessionResponse>("/auth/login", { method: "POST", body: input }),

    // Unlike apps/web, which relies on the refresh token cookie and
    // sends no body, mobile has to present the refresh token itself
    // (see auth.routes.ts's cookie ?? body.refreshToken fallback) —
    // there's no cookie for it to fall back to.
    logout: (refreshToken: string) =>
      apiFetch<void>("/auth/logout", { method: "POST", body: { refreshToken } }),

    logoutAll: () => apiFetch<void>("/auth/logout-all", { method: "POST" }),

    me: () => apiFetch<UserDto>("/auth/me"),

    resendVerification: (email: string) =>
      apiFetch<void>("/auth/resend-verification", { method: "POST", body: { email } }),

    forgotPassword: (email: string) =>
      apiFetch<void>("/auth/forgot-password", { method: "POST", body: { email } }),
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
};
