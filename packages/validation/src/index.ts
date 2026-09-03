import { z } from "zod";

/**
 * Shared Zod primitives so every app validates pagination, IDs, etc.
 * identically. Domain schemas (RegisterUserSchema, LogSymptomSchema, ...)
 * are added here starting Milestone 2/3 and re-exported for both the API
 * (request validation) and the frontend (React Hook Form resolvers).
 */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ---- Auth (Milestone 2) ----
//
// A single password policy lives here so the API (server-side
// enforcement) and the web/admin apps (client-side form feedback via
// React Hook Form resolvers) can never drift apart.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-z]/.test(v), "Password must include a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Password must include an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Password must include a digit");

export const emailSchema = z.string().trim().toLowerCase().email("Must be a valid email address");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// Browser clients call /auth/refresh and /auth/logout with an empty
// body — the refresh token comes from the httpOnly cookie. Mobile
// clients have no cookie to read it from, so it's an optional fallback
// field here rather than its own separate schema/route; the field is
// simply absent (and this validates fine against {}) for the cookie
// case.
export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshTokenBodyInput = z.infer<typeof refreshTokenBodySchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---- Core domain (Milestone 3) ----

export const symptomCategorySchema = z.enum([
  "HOT_FLASH",
  "NIGHT_SWEATS",
  "MOOD_CHANGE",
  "SLEEP_DISTURBANCE",
  "BRAIN_FOG",
  "JOINT_PAIN",
  "FATIGUE",
  "ANXIETY",
  "IRREGULAR_HEARTBEAT",
  "VAGINAL_DRYNESS",
  "LIBIDO_CHANGE",
  "WEIGHT_CHANGE",
  "HEADACHE",
  "OTHER",
]);

export const severityLevelSchema = z.enum(["MILD", "MODERATE", "SEVERE"]);

export const createSymptomLogSchema = z.object({
  category: symptomCategorySchema,
  severity: severityLevelSchema,
  occurredAt: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateSymptomLogInput = z.infer<typeof createSymptomLogSchema>;

export const updateSymptomLogSchema = createSymptomLogSchema.partial();
export type UpdateSymptomLogInput = z.infer<typeof updateSymptomLogSchema>;

export const symptomLogQuerySchema = paginationQuerySchema.extend({
  category: symptomCategorySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type SymptomLogQuery = z.infer<typeof symptomLogQuerySchema>;

// ---- Treatments ----

export const treatmentCategorySchema = z.enum([
  "HRT",
  "SUPPLEMENT",
  "MEDICATION",
  "LIFESTYLE",
  "OTHER",
]);

export const createTreatmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: treatmentCategorySchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  });
export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;

// Deliberately not `createTreatmentSchema.partial()` like
// updateSymptomLogSchema — .partial() would drop the endDate>=startDate
// refinement (ZodEffects can't be partial()'d directly), and a partial
// update still needs that invariant to hold against whichever fields
// are actually being changed.
export const updateTreatmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    category: treatmentCategorySchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "endDate cannot be before startDate",
    path: ["endDate"],
  });
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;

export const treatmentQuerySchema = paginationQuerySchema.extend({
  category: treatmentCategorySchema.optional(),
  // "Currently active" — startDate <= today and (endDate is null or
  // endDate >= today) — rather than a raw date-range filter, since
  // that's the query a treatment list screen actually wants ("what am
  // I on right now") most of the time.
  active: z.coerce.boolean().optional(),
});
export type TreatmentQuery = z.infer<typeof treatmentQuerySchema>;

export const flowIntensitySchema = z.enum(["SPOTTING", "LIGHT", "MEDIUM", "HEAVY"]);

export const upsertCycleEntrySchema = z.object({
  date: z.coerce.date(),
  flow: flowIntensitySchema.optional(),
  isPeriodStart: z.boolean().optional().default(false),
  isPeriodEnd: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).optional(),
});
export type UpsertCycleEntryInput = z.infer<typeof upsertCycleEntrySchema>;

// date is the entry's identity (see the userId+date unique constraint) —
// updating it would mean updating a different entry entirely, so PATCH
// deliberately excludes it.
export const updateCycleEntrySchema = upsertCycleEntrySchema.omit({ date: true }).partial();
export type UpdateCycleEntryInput = z.infer<typeof updateCycleEntrySchema>;

export const cycleEntryQuerySchema = paginationQuerySchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type CycleEntryQuery = z.infer<typeof cycleEntryQuerySchema>;

// ---- Export (Milestone 6) ----
//
// Deliberately unpaginated — an export is "everything in this range,"
// not a page of it. The route layer applies its own hard safety cap
// (see exportRepository) rather than exposing that as a client-facing
// parameter.
export const exportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

// ---- Admin (Milestone 7) ----
//
// Deliberately limited to operational data: account and audit-trail
// visibility, never symptom/cycle records. See docs/MILESTONES.md for
// why that line is drawn where it is.
export const adminUserQuerySchema = paginationQuerySchema;
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;

export const adminAuditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
});
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;

// ---- Trends (Milestone 9) ----
//
// Same shape as exportQuerySchema (unpaginated, from/to only) and for
// the same reason: a trend is computed over "everything in this range,"
// not a page of it. Symptom frequency is a true DB-side aggregate
// (COUNT ... GROUP BY) so it isn't subject to any row cap; cycle length
// applies its own safety ceiling in trendsRepository, the same pattern
// exportRepository established in Milestone 6.
export const trendsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type TrendsQuery = z.infer<typeof trendsQuerySchema>;

// ---- Reflections (Milestone 19) ----
//
// Same unpaginated from/to shape as trendsQuerySchema and for the same
// reason: a reflection is computed over "everything in this period,"
// not a page of it. Defaults to the trailing 7 days when omitted (see
// reflection.service.ts) rather than defaulting here, so the default
// window lives in one place alongside the rest of the computation.
export const reflectionsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ReflectionsQuery = z.infer<typeof reflectionsQuerySchema>;

export const reflectionTypeSchema = z.enum([
  "LOGGING_ACTIVITY",
  "SYMPTOM_FREQUENCY",
  "SYMPTOM_CO_OCCURRENCE",
  "TREATMENT_CONTEXT",
]);

// Body, not a URL param — a dismissal key can contain characters (":",
// category names) that are awkward to guarantee URL-safe across every
// client, and every other "act on a thing identified by more than a
// bare id" endpoint in this API (e.g. acceptInviteSchema) already goes
// through the request body for the same reason.
export const dismissReflectionSchema = z.object({
  type: reflectionTypeSchema,
  key: z.string().min(1).max(200),
});
export type DismissReflectionInput = z.infer<typeof dismissReflectionSchema>;

// ---- Organizations (Milestone 12) ----
//
// Org provisioning is a platform-ADMIN action, not self-serve (see
// organization.routes.ts) — the slug is chosen at creation time by
// whoever's provisioning the account, not derived automatically, so ops
// can match it to whatever the customer already calls themselves.
export const orgRoleSchema = z.enum(["ORG_ADMIN", "ORG_MEMBER"]);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with single hyphens");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  seatLimit: z.number().int().positive().optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: orgRoleSchema.default("ORG_MEMBER"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const organizationMemberQuerySchema = paginationQuerySchema;
export type OrganizationMemberQuery = z.infer<typeof organizationMemberQuerySchema>;

// Same unpaginated from/to shape as trendsQuerySchema, for the same
// reason: an org trend is computed over "everything in range," not a
// page of it — the k-anonymity floor (see organization.service.ts)
// suppresses the output entirely for a too-small cohort, so there's no
// per-row cap to design around the way exportRepository needed one.
export const orgTrendsQuerySchema = trendsQuerySchema;
export type OrgTrendsQuery = z.infer<typeof orgTrendsQuerySchema>;

// ---- Billing (Stripe) ----
//
// One field, deliberately: `seats` is the Stripe Checkout line-item
// quantity, i.e. how many seats the org is buying. Everything else
// (customer, price, success/cancel URLs) is server-side — see
// billing.service.ts — never client-supplied, so a request here can't
// point Checkout at an arbitrary price id or redirect URL.
export const createCheckoutSessionSchema = z.object({
  seats: z.number().int().positive().max(100000),
});
export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>;

// ---- SSO (Milestone 15) ----

export const ssoStartQuerySchema = z.object({
  email: emailSchema,
});
export type SsoStartQuery = z.infer<typeof ssoStartQuerySchema>;

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "Must be a valid domain, e.g. acme.com",
  );

// Full-replace PUT, same convention as createOrganizationSchema — the
// client secret is always required here even when only e.g. flipping
// `enabled`, since the API never echoes back the existing plaintext
// secret for a partial update to omit (see sso.mappers.ts).
export const upsertSsoConnectionSchema = z.object({
  issuerUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .refine((v) => v.startsWith("https://"), "Issuer URL must use https"),
  clientId: z.string().trim().min(1).max(500),
  clientSecret: z.string().min(1).max(2000),
  allowedEmailDomain: domainSchema,
  enabled: z.boolean().default(false),
});
export type UpsertSsoConnectionInput = z.infer<typeof upsertSsoConnectionSchema>;

// ---- EMBR BRIEF (Milestone 17) ----

// Unlike exportQuerySchema/trendsQuerySchema, both dates are required
// here — an unbounded "all time" AI-summarized brief is a worse
// product decision than requiring the person to pick a range (and
// doesn't map to how GP-visit prep actually works: "since my last
// visit," not "ever").
export const generateBriefSchema = z
  .object({
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  })
  .refine((v) => v.fromDate < v.toDate, {
    message: "fromDate must be before toDate",
    path: ["toDate"],
  });
export type GenerateBriefInput = z.infer<typeof generateBriefSchema>;

// ---- Onboarding (Milestone 18) ----

export const onboardingJobToBeDoneSchema = z.enum([
  "UNDERSTAND_EXPERIENCE",
  "UNDERSTAND_PATTERNS",
  "PREPARE_FOR_APPOINTMENT",
  "KEEP_RECORD",
  "NOT_SURE",
]);

// Broad, non-clinical buckets — see schema.prisma's OnboardingArea doc
// comment for why this is deliberately not SymptomCategory.
export const onboardingAreaSchema = z.enum(["SLEEP", "ENERGY", "MOOD", "BODY", "FOCUS"]);

export const onboardingAppointmentStatusSchema = z.enum([
  "WITHIN_MONTH",
  "UNSURE_WHEN",
  "NO",
  "UNSURE",
]);

export const onboardingStepSchema = z.enum([
  "WELCOME",
  "JOB_TO_BE_DONE",
  "WHATS_GOING_ON",
  "APPOINTMENT_STATUS",
  "THE_LOOP",
]);

// Every field optional (a genuine partial update — the client PATCHes
// after each screen with only what that screen collected) but every
// value strictly validated against a closed enum when present; unknown
// top-level keys are rejected outright via .strict() rather than
// silently ignored.
export const patchOnboardingSchema = z
  .object({
    currentStep: onboardingStepSchema.optional(),
    jobToBeDone: onboardingJobToBeDoneSchema.optional(),
    noticedAreas: z.array(onboardingAreaSchema).optional(),
    appointmentStatus: onboardingAppointmentStatusSchema.optional(),
    // Two distinct terminal actions, not a boolean "done" flag — a
    // skip and a full completion both end onboarding the same way
    // (completedAt gets set, onboarding never shows again) but mean
    // different things for later analysis, so the API needs to know
    // which one happened, not just that *an* ending happened.
    status: z.enum(["completed", "skipped"]).optional(),
  })
  .strict();
export type PatchOnboardingInput = z.infer<typeof patchOnboardingSchema>;

// ---- Account deletion (closed-beta minimum) ----

// Same password-confirmation bar as changePasswordSchema — this is a
// destructive, irreversible action, and a still-logged-in-but-hijacked
// or accidentally-tapped session shouldn't be able to trigger it
// without re-proving the password.
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// ---- Public perimenopause assessment (unauthenticated, no persistence) ----

// Reuses the real symptomCategorySchema — no separate, drifting list of
// symptom names for this public-facing entry point. A max() guards
// against a payload trying to submit the same category dozens of times
// to inflate a score; the scoring function also de-duplicates
// defensively (see assessment-scoring.ts), this is just a cheap
// request-level sanity bound.
export const perimenopauseAssessmentSchema = z
  .object({
    symptoms: z.array(symptomCategorySchema).max(20),
    hasIrregularPeriods: z.boolean(),
  })
  .strict();
export type PerimenopauseAssessmentInput = z.infer<typeof perimenopauseAssessmentSchema>;
