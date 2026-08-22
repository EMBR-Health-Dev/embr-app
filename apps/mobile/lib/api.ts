import type {
  AuthSessionResponse,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  CycleEntryDto,
  CycleLengthTrendDto,
  DeviceSessionDto,
  OnboardingProfileDto,
  PaginatedResponse,
  SymptomCoOccurrenceDto,
  SymptomFrequencyDto,
  SymptomLogDto,
  TreatmentDto,
  TreatmentImpactDto,
  UserDto,
} from "@embr/types";
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

    // Server-side revokes every session on success (see
    // auth.service.ts) — same as apps/web, the caller is expected to
    // treat this as an implicit logout on this device too, not just a
    // password update.
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>("/auth/change-password", { method: "POST", body: input }),

    deleteAccount: (input: { password: string }) =>
      apiFetch<void>("/auth/me", { method: "DELETE", body: input }),

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

    // Upsert, not create — date is the entry's identity (one entry per
    // user per day), so posting again for a date that already has an
    // entry updates it rather than erroring or duplicating.
    upsert: (input: {
      date: string;
      flow?: string;
      isPeriodStart?: boolean;
      isPeriodEnd?: boolean;
      notes?: string;
    }) => apiFetch<CycleEntryDto>("/cycle-entries", { method: "POST", body: input }),
  },

  trends: {
    symptomFrequency: (query?: { from?: string; to?: string }) =>
      apiFetch<SymptomFrequencyDto[]>("/trends/symptom-frequency", { query }),

    cycleLength: (query?: { from?: string; to?: string }) =>
      apiFetch<CycleLengthTrendDto>("/trends/cycle-length", { query }),

    coOccurrence: (query?: { from?: string; to?: string }) =>
      apiFetch<SymptomCoOccurrenceDto | null>("/trends/co-occurrence", { query }),
  },

  treatments: {
    list: (query?: { page?: number; pageSize?: number; category?: string; active?: boolean }) =>
      apiFetch<PaginatedResponse<TreatmentDto>>("/treatments", {
        query:
          query === undefined
            ? undefined
            : {
                ...query,
                active: query.active === undefined ? undefined : String(query.active),
              },
      }),

    create: (input: {
      name: string;
      category: string;
      startDate: string;
      endDate?: string;
      notes?: string;
    }) => apiFetch<TreatmentDto>("/treatments", { method: "POST", body: input }),

    update: (
      id: string,
      input: Partial<{
        name: string;
        category: string;
        startDate: string;
        endDate: string | null;
        notes: string;
      }>,
    ) => apiFetch<TreatmentDto>(`/treatments/${id}`, { method: "PATCH", body: input }),

    delete: (id: string) => apiFetch<void>(`/treatments/${id}`, { method: "DELETE" }),

    impact: (id: string) => apiFetch<TreatmentImpactDto>(`/treatments/${id}/impact`),
  },

  briefs: {
    generate: (input: { fromDate: string; toDate: string }) =>
      apiFetch<ClinicalBriefDto>("/briefs", { method: "POST", body: input }),

    list: (query?: { page?: number; pageSize?: number }) =>
      apiFetch<PaginatedResponse<ClinicalBriefListItemDto>>("/briefs", { query }),

    get: (id: string) => apiFetch<ClinicalBriefDto>(`/briefs/${id}`),

    delete: (id: string) => apiFetch<void>(`/briefs/${id}`, { method: "DELETE" }),
  },

  onboarding: {
    get: () => apiFetch<OnboardingProfileDto>("/onboarding"),

    patch: (input: {
      currentStep?: string;
      jobToBeDone?: string;
      noticedAreas?: string[];
      appointmentStatus?: string;
      status?: "completed" | "skipped";
    }) => apiFetch<OnboardingProfileDto>("/onboarding", { method: "PATCH", body: input }),
  },
};
