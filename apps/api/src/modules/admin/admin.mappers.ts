import type { AuditLog } from "../../generated/prisma/index.js";
import type { AuditLogDto } from "@embr/types";

export function toAuditLogDto(log: AuditLog): AuditLogDto {
  return {
    id: log.id,
    userId: log.userId,
    action: log.action,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
  };
}
