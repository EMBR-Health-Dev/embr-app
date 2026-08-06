import type {
  AuthSessionResponse,
  CycleEntryDto,
  CycleLengthTrendDto,
  DeviceSessionDto,
  MyOrganizationMembershipDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
  PaginatedResponse,
  SsoConnectionDto,
  SymptomFrequencyDto,
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

  trends: {
    symptomFrequency: (query?: { from?: string; to?: string }) =>
      apiFetch<SymptomFrequencyDto[]>("/trends/symptom-frequency", { query }),

    cycleLength: (query?: { from?: string; to?: string }) =>
      apiFetch<CycleLengthTrendDto>("/trends/cycle-length", { query }),
  },

  organizations: {
    // The one call that doesn't need an organizationId already in
    // hand — see the API route's own comment on why it's ordered
    // ahead of /organizations/:organizationId server-side.
    mine: () => apiFetch<MyOrganizationMembershipDto[]>("/organizations/mine"),

    get: (organizationId: string) => apiFetch<OrganizationDto>(`/organizations/${organizationId}`),

    members: {
      list: (organizationId: string, query?: { page?: number; pageSize?: number }) =>
        apiFetch<PaginatedResponse<OrganizationMemberDto>>(
          `/organizations/${organizationId}/members`,
          { query },
        ),

      revoke: (organizationId: string, userId: string) =>
        apiFetch<void>(`/organizations/${organizationId}/members/${userId}`, {
          method: "DELETE",
        }),
    },

    invites: {
      create: (
        organizationId: string,
        input: { email: string; role: "ORG_ADMIN" | "ORG_MEMBER" },
      ) =>
        apiFetch<OrganizationInviteDto>(`/organizations/${organizationId}/invites`, {
          method: "POST",
          body: input,
        }),

      accept: (token: string) =>
        apiFetch<{ joined: boolean }>("/organizations/invites/accept", {
          method: "POST",
          body: { token },
        }),
    },

    trends: {
      symptomFrequency: (organizationId: string, query?: { from?: string; to?: string }) =>
        apiFetch<OrgSymptomFrequencyDto>(
          `/organizations/${organizationId}/trends/symptom-frequency`,
          { query },
        ),
    },

    sso: {
      get: (organizationId: string) =>
        apiFetch<SsoConnectionDto | null>(`/organizations/${organizationId}/sso`),

      upsert: (
        organizationId: string,
        input: {
          issuerUrl: string;
          clientId: string;
          clientSecret: string;
          allowedEmailDomain: string;
          enabled: boolean;
        },
      ) =>
        apiFetch<SsoConnectionDto>(`/organizations/${organizationId}/sso`, {
          method: "PUT",
          body: input,
        }),
    },
  },

  sso: {
    // Not a JSON call — this is a full-page navigation, so the caller
    // sets window.location.href to this rather than awaiting a
    // response. Exposed as a plain URL builder for that reason.
    startUrl: (email: string) => `/api/auth/sso/start?email=${encodeURIComponent(email)}`,
  },
};
