import type {
  AuthSessionResponse,
  BriefTrendsDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  CycleEntryDto,
  CycleLengthTrendDto,
  DeviceSessionDto,
  MyOrganizationMembershipDto,
  OnboardingProfileDto,
  OrgBillingStatusDto,
  OrganizationDto,
  OrganizationInviteDto,
  OrganizationMemberDto,
  OrgSymptomFrequencyDto,
  PaginatedResponse,
  SsoConnectionDto,
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

    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),

    logoutAll: () => apiFetch<void>("/auth/logout-all", { method: "POST" }),

    me: () => apiFetch<UserDto>("/auth/me"),

    verifyEmail: (token: string) =>
      apiFetch<void>("/auth/verify-email", { method: "POST", body: { token } }),

    resendVerification: (email: string) =>
      apiFetch<void>("/auth/resend-verification", { method: "POST", body: { email } }),

    forgotPassword: (email: string) =>
      apiFetch<void>("/auth/forgot-password", { method: "POST", body: { email } }),

    resetPassword: (input: { token: string; password: string }) =>
      apiFetch<void>("/auth/reset-password", { method: "POST", body: input }),

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

      leave: (organizationId: string) =>
        apiFetch<void>(`/organizations/${organizationId}/leave`, { method: "POST" }),
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

    billing: {
      get: (organizationId: string) =>
        apiFetch<OrgBillingStatusDto>(`/organizations/${organizationId}/billing`),

      // Returns a Stripe-hosted URL, not same-origin — the caller does
      // a full-page `window.location.href = url` navigation, same
      // reasoning as api.sso.startUrl above, just POST-first since
      // this one needs a body (seat count) and a fresh Checkout
      // Session per request rather than a deterministic redirect URL.
      createCheckoutSession: (organizationId: string, input: { seats: number }) =>
        apiFetch<{ url: string }>(`/organizations/${organizationId}/billing/checkout-session`, {
          method: "POST",
          body: input,
        }),

      createPortalSession: (organizationId: string) =>
        apiFetch<{ url: string }>(`/organizations/${organizationId}/billing/portal-session`, {
          method: "POST",
        }),
    },
  },

  briefs: {
    generate: (input: { fromDate: string; toDate: string }) =>
      apiFetch<ClinicalBriefDto>("/briefs", { method: "POST", body: input }),

    list: (query?: { page?: number; pageSize?: number }) =>
      apiFetch<PaginatedResponse<ClinicalBriefListItemDto>>("/briefs", { query }),

    trends: () => apiFetch<BriefTrendsDto>("/briefs/trends"),

    get: (id: string) => apiFetch<ClinicalBriefDto>(`/briefs/${id}`),

    delete: (id: string) => apiFetch<void>(`/briefs/${id}`, { method: "DELETE" }),

    // Not a JSON call — same reasoning as the export page's downloads:
    // a plain same-origin URL the browser handles natively (cookies
    // included automatically via the /api proxy), not a fetch() call.
    pdfUrl: (id: string) => `/api/briefs/${id}/pdf`,
  },

  sso: {
    // Not a JSON call — this is a full-page navigation, so the caller
    // sets window.location.href to this rather than awaiting a
    // response. Exposed as a plain URL builder for that reason.
    startUrl: (email: string) => `/api/auth/sso/start?email=${encodeURIComponent(email)}`,
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
