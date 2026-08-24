/**
 * Cross-app TypeScript types with zero runtime dependencies.
 * Business-domain types (User, Symptom, CycleEntry, ...) land here
 * starting Milestone 3, generated from / kept in sync with the Prisma
 * schema and the OpenAPI spec.
 */

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  requestId: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  uptimeSeconds: number;
  version: string;
  checks: Record<string, { status: "ok" | "down"; latencyMs?: number; message?: string }>;
}

// ---- Auth (Milestone 2) ----

export type Role = "MEMBER" | "ADMIN";

/** Public-safe user shape — never includes passwordHash. */
export interface UserDto {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  /** Null until the person finishes or explicitly skips onboarding —
   * this is the one signal both web and mobile use to decide whether
   * to route to /onboarding or straight to the dashboard, so it's
   * carried on the same UserDto every /auth/me (and login/refresh)
   * call already returns, rather than needing a second request.
   * Deliberately just a timestamp, not any of the actual onboarding
   * answers (job-to-be-done, noticed areas, appointment status) —
   * those are health-adjacent and live only behind GET /onboarding,
   * never on UserDto. */
  onboardingCompletedAt: string | null;
}

export interface AuthSessionResponse {
  user: UserDto;
  /**
   * Present for non-browser clients (mobile) that can't rely on
   * httpOnly cookies. Browser clients should read the session from the
   * cookie the API sets and ignore this field.
   */
  accessToken: string;
  /**
   * Same reasoning as accessToken above. Rotates on every
   * /auth/refresh call — a mobile client must persist the new value
   * each time, not just the one from login, or the next refresh will
   * fail with an already-consumed token.
   */
  refreshToken: string;
}

export interface DeviceSessionDto {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

// ---- Core domain (Milestone 3) ----

export type SymptomCategory =
  | "HOT_FLASH"
  | "NIGHT_SWEATS"
  | "MOOD_CHANGE"
  | "SLEEP_DISTURBANCE"
  | "BRAIN_FOG"
  | "JOINT_PAIN"
  | "FATIGUE"
  | "ANXIETY"
  | "IRREGULAR_HEARTBEAT"
  | "VAGINAL_DRYNESS"
  | "LIBIDO_CHANGE"
  | "WEIGHT_CHANGE"
  | "HEADACHE"
  | "OTHER";

export type SeverityLevel = "MILD" | "MODERATE" | "SEVERE";

export interface SymptomLogDto {
  id: string;
  category: SymptomCategory;
  severity: SeverityLevel;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Treatments ----

export type TreatmentCategory = "HRT" | "SUPPLEMENT" | "MEDICATION" | "LIFESTYLE" | "OTHER";

export interface TreatmentDto {
  id: string;
  name: string;
  category: TreatmentCategory;
  startDate: string;
  /** Null means ongoing/current. */
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Deterministic before/after symptom-log-frequency comparison around
 * a treatment's start date — no AI, no interpretation, matching
 * SymptomCoOccurrenceDto's exact "counts only" precedent. `days` on
 * each side is how many calendar days that window actually spans (the
 * "after" window can be shorter than `windowDays` for a treatment
 * that started recently or already ended) — a client needs this to
 * render a fair "per day"/"per week" rate rather than comparing raw
 * counts across windows of different lengths.
 */
export interface TreatmentImpactDto {
  treatmentId: string;
  windowDays: number;
  before: { logCount: number; days: number };
  after: { logCount: number; days: number };
  /** True when the "after" window hasn't run long enough yet for the
   * comparison to mean much — see MIN_TREATMENT_IMPACT_DAYS. */
  insufficientData: boolean;
}

export type FlowIntensity = "SPOTTING" | "LIGHT" | "MEDIUM" | "HEAVY";

export interface CycleEntryDto {
  id: string;
  date: string;
  flow: FlowIntensity | null;
  isPeriodStart: boolean;
  isPeriodEnd: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---- Trends (Milestone 9) ----

export interface SymptomFrequencyDto {
  category: SymptomCategory;
  count: number;
}

export interface CycleLengthEntryDto {
  from: string;
  to: string;
  days: number;
}

export interface CycleLengthTrendDto {
  averageDays: number | null;
  lengths: CycleLengthEntryDto[];
}

/** Structured data only, deliberately no preformatted sentence — the
 * exact wording (and its translation) is a client concern, not an API
 * one. null means no pair of categories met the co-occurrence
 * threshold in the queried window, which is the normal, expected case
 * for most people, not an error. */
export interface SymptomCoOccurrenceDto {
  categoryA: SymptomCategory;
  categoryB: SymptomCategory;
  days: number;
}

// ---- Public perimenopause assessment (unauthenticated) ----

/** score is a plain count, never weighted or modeled — deliberately
 * transparent and reproducible, not a "clinical algorithm." tier is
 * derived from score purely for the client to pick which follow-up
 * copy/CTA to show; it is not, and must never be presented as, a
 * diagnosis. */
export interface PerimenopauseAssessmentResultDto {
  score: number;
  tier: "low" | "high";
}

// ---- Admin (Milestone 7) ----

export interface AuditLogDto {
  id: string;
  userId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// ---- Organizations (Milestone 12) ----

export type OrgRole = "ORG_ADMIN" | "ORG_MEMBER";

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  seatLimit: number | null;
  memberCount: number;
  createdAt: string;
}

export type StripeSubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

/**
 * An organization's billing state — deliberately just status/dates/seat
 * counts, never anything Stripe-account-identifying beyond whether a
 * customer relationship exists (`hasStripeCustomer`), since the raw
 * Stripe ids have no use on a settings screen and shouldn't be handed
 * to the browser for no reason.
 */
export interface OrgBillingStatusDto {
  hasStripeCustomer: boolean;
  subscriptionStatus: StripeSubscriptionStatus | null;
  seatLimit: number | null;
  seatsUsed: number;
  currentPeriodEnd: string | null;
  /** False when STRIPE_SECRET_KEY isn't configured on this deployment
   * — lets a settings screen show "billing isn't available yet" rather
   * than a confusing empty state or a failed request. */
  billingEnabled: boolean;
}

/** Roster entry — deliberately just account + org-role metadata, never
 * anything from that member's SymptomLog/CycleEntry records. */
export interface OrganizationMemberDto {
  id: string;
  userId: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
}

export interface OrganizationInviteDto {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
}

/** One row per organization the current user belongs to — lets a user
 * discover which org(s) they're in and in what role, without already
 * knowing an organizationId (see GET /organizations/mine). */
export interface MyOrganizationMembershipDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
  joinedAt: string;
}

/**
 * Cohort-level, anonymized only. `suppressed: true` means the
 * organization's active membership fell below the minimum cohort size
 * (see ORG_TRENDS_MIN_COHORT_SIZE) — in that case `categories` is always
 * empty, on purpose: a small enough org makes even a category-level
 * count individually identifying, so nothing is returned rather than a
 * technically-true-but-unsafe number.
 */
export interface OrgSymptomFrequencyDto {
  suppressed: boolean;
  cohortSize: number;
  categories: Array<{ category: SymptomCategory; count: number }>;
}

/**
 * Employer activation metrics — cohort-level, anonymized, no individual
 * member is ever identifiable from this response. Same k-anonymity
 * treatment as OrgSymptomFrequencyDto above, applied to eligibleCount
 * rather than an already-filtered active-logger count (see
 * organization.service.ts's activation() for why that distinction
 * matters here specifically).
 *
 * BUSINESS DEFINITIONS — these are deliberate product decisions, not
 * implementation details, and changing any of them changes what this
 * metric means to a customer. Do not alter without revisiting the
 * definition itself (see organization.activation.ts for the
 * authoritative constants and reasoning):
 *
 * - Eligible employee: has an accepted OrganizationMembership row for
 *   this organization. Pending invites do not count.
 * - Activated employee: an eligible employee with at least one
 *   SymptomLog or CycleEntry logged within their first 30 days after
 *   their OrganizationMembership.createdAt — a per-member relative
 *   window, not a shared org-wide date range.
 * - Weekly active employee: an eligible employee with at least one
 *   SymptomLog or CycleEntry in the trailing 7 days from `asOf` — a
 *   single shared window as of one point in time, not per-member
 *   relative.
 *
 * null (not 0) for every metric beyond eligibleCount when suppressed —
 * distinguishes "withheld because the cohort is too small" from "this
 * organization genuinely has zero activated employees," the same
 * distinction OrgSymptomFrequencyDto's empty-vs-suppressed categories
 * array already makes.
 */
export interface OrgActivationDto {
  suppressed: boolean;
  eligibleCount: number;
  activatedCount: number | null;
  activationPercentage: number | null;
  weeklyActiveCount: number | null;
  weeklyActivePercentage: number | null;
  activationWindowDays: number;
  asOf: string;
}

// ---- SSO (Milestone 15) ----

/** Never includes the client secret, encrypted or otherwise — the
 * frontend only ever needs to know a secret is configured, not its
 * value (see sso.mappers.ts). */
export interface SsoConnectionDto {
  id: string;
  protocol: "OIDC";
  issuerUrl: string;
  clientId: string;
  hasClientSecret: boolean;
  allowedEmailDomain: string;
  enabled: boolean;
  enforced: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- EMBR BRIEF (Milestone 17) ----

export interface BriefSymptomSummaryEntryDto {
  category: SymptomCategory;
  count: number;
  severityBreakdown: Record<string, number>;
}

export interface BriefCycleSummaryDto {
  averageCycleLengthDays: number | null;
  cycleCount: number;
  periodDaysLogged: number;
}

/** A deterministic snapshot of Treatment records overlapping the
 * BRIEF's date range, taken at generation time — never a live query.
 * Deliberately excludes notes: see the Treatment-in-BRIEF design
 * notes in brief.service.ts for why free-text treatment notes are
 * excluded from BRIEF entirely, the same way SymptomLog.notes always
 * has been. Never sent to the AI — this type has no relationship to
 * BriefInput in brief.ai.ts. */
export interface BriefTreatmentSummaryEntryDto {
  name: string;
  category: TreatmentCategory;
  startDate: string;
  endDate: string | null;
}

/** The list view — no AI content, keeps history/pagination responses
 * small. Fetch the full ClinicalBriefDto to read the narrative. */
export interface ClinicalBriefListItemDto {
  id: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
}

/** aiNarrative and aiDiscussionTopics are AI-generated from the
 * structured summary alone — see brief.ai.ts's system prompt for the
 * exact scope constraints (data-grounded only, never diagnostic,
 * discussion topics framed as questions, never assertions).
 * treatmentSummary is never part of that — it's a deterministic,
 * database-sourced snapshot with no AI involvement at all. */
export interface ClinicalBriefDto extends ClinicalBriefListItemDto {
  symptomSummary: BriefSymptomSummaryEntryDto[];
  cycleSummary: BriefCycleSummaryDto;
  treatmentSummary: BriefTreatmentSummaryEntryDto[];
  aiNarrative: string;
  aiDiscussionTopics: string[];
}

// ---- Onboarding (Milestone 18) ----

/** Same shape whether a row exists yet or not — a user who's never
 * touched onboarding gets all-null/empty fields, identical in meaning
 * to a row that exists with completedAt: null. The client doesn't need
 * to special-case "no row yet" vs. "row exists, nothing answered." */
export interface OnboardingProfileDto {
  jobToBeDone: string | null;
  noticedAreas: string[];
  appointmentStatus: string | null;
  currentStep: string | null;
  skipped: boolean;
  completedAt: string | null;
}
