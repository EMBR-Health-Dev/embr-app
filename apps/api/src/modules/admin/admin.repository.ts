import type { AdminAuditLogQuery, AdminUserQuery } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

export const adminRepository = {
  async listUsers(query: AdminUserQuery) {
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        ...toSkipTake(query),
      }),
      prisma.user.count(),
    ]);
    return { items, total };
  },

  async listAuditLogs(query: AdminAuditLogQuery) {
    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...toSkipTake(query),
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  },
};
