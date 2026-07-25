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
}

export interface AuthSessionResponse {
  user: UserDto;
  /**
   * Present for non-browser clients (mobile) that can't rely on
   * httpOnly cookies. Browser clients should read the session from the
   * cookie the API sets and ignore this field.
   */
  accessToken: string;
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
