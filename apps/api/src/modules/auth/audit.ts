import type { Request } from "express";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";

export type AuditAction =
  | "USER_REGISTERED"
  | "EMAIL_VERIFIED"
  | "LOGIN_SUCCEEDED"
  | "LOGIN_FAILED"
  | "TOKEN_REFRESHED"
  | "REFRESH_TOKEN_REUSE_DETECTED"
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "SESSION_REVOKED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "DATA_EXPORTED"
  | "ADMIN_VIEWED_USERS"
  | "ADMIN_VIEWED_AUDIT_LOGS"
  | "ADMIN_VIEWED_ORGANIZATIONS"
  | "ORG_CREATED"
  | "ORG_MEMBER_INVITED"
  | "ORG_MEMBER_JOINED"
  | "ORG_MEMBER_REVOKED"
  | "ORG_MEMBER_LEFT"
  | "ORG_MEMBERS_VIEWED"
  | "ORG_AGGREGATE_TRENDS_VIEWED"
  | "ORG_ACTIVATION_METRICS_VIEWED"
  | "ORG_BILLING_CHECKOUT_STARTED"
  | "ORG_BILLING_PORTAL_OPENED"
  | "SYMPTOM_LOG_CREATED"
  | "SYMPTOM_LOG_UPDATED"
  | "SYMPTOM_LOG_DELETED"
  | "CYCLE_ENTRY_UPSERTED"
  | "CYCLE_ENTRY_UPDATED"
  | "CYCLE_ENTRY_DELETED"
  | "TREATMENT_CREATED"
  | "TREATMENT_UPDATED"
  | "TREATMENT_DELETED"
  | "SSO_CONNECTION_CONFIGURED"
  | "SSO_USER_PROVISIONED"
  | "SSO_LOGIN_SUCCEEDED"
  | "SSO_LOGIN_FAILED"
  | "CLINICAL_BRIEF_GENERATED"
  | "CLINICAL_BRIEF_DOWNLOADED"
  | "CLINICAL_BRIEF_DELETED"
  | "ONBOARDING_COMPLETED"
  | "ONBOARDING_SKIPPED"
  | "ACCOUNT_DELETED";

/**
 * Actions worth a human noticing in a log aggregator / alert rather than
 * just an "info" line — repeated failures or anomalies rather than
 * routine activity. Not exhaustive of everything security-relevant (all
 * of these are audited either way); this only affects log *level*, i.e.
 * what's worth alerting on without querying the audit_log table.
 */
const SECURITY_SENSITIVE_ACTIONS: ReadonlySet<AuditAction> = new Set([
  "LOGIN_FAILED",
  "REFRESH_TOKEN_REUSE_DETECTED",
  "ORG_MEMBER_REVOKED",
]);

/**
 * Best-effort, append-only security audit trail. The DB write here is
 * never allowed to fail an otherwise-successful auth/org operation, so
 * failures are logged, not thrown.
 *
 * The structured log line below is deliberately independent of that DB
 * write (emitted first, unconditionally) rather than folded into it: a
 * log aggregator can alert on it (e.g. a spike in LOGIN_FAILED or
 * REFRESH_TOKEN_REUSE_DETECTED) without querying Postgres, and — more
 * importantly — that signal must not go missing on exactly the kind of
 * database blip that would also make the audit_log write below fail.
 */
export async function writeAuditLog(
  req: Request,
  action: AuditAction,
  userId: string | null,
  metadata?: Record<string, unknown>,
) {
  const level = SECURITY_SENSITIVE_ACTIONS.has(action) ? "warn" : "info";
  logger[level]({ action, userId, requestId: req.requestId, ...metadata }, "audit event");

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        ipAddress: req.ip,
        userAgent: req.header("user-agent") ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action, userId }, "failed to write audit log");
  }
}
