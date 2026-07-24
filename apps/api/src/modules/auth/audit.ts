import type { Request } from "express";
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
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED";

/**
 * Best-effort, append-only security audit trail. Failures here are
 * logged but never thrown — an audit-log write must not be able to
 * fail an otherwise-successful auth operation.
 */
export async function writeAuditLog(
  req: Request,
  action: AuditAction,
  userId: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        metadata,
        ipAddress: req.ip,
        userAgent: req.header("user-agent") ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action, userId }, "failed to write audit log");
  }
}
