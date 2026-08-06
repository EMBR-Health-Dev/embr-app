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
