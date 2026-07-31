import type {
  CreateOrganizationInput,
  OrganizationMemberQuery,
  OrgTrendsQuery,
} from "@embr/validation";
import type { OrgRole } from "@embr/types";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

export const organizationRepository = {
  createOrganization(input: CreateOrganizationInput) {
    return prisma.organization.create({ data: input });
  },

  findOrganizationById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  findOrganizationBySlug(slug: string) {
    return prisma.organization.findUnique({ where: { slug } });
  },

  countMembers(organizationId: string) {
    return prisma.organizationMembership.count({ where: { organizationId } });
  },

  findMembership(organizationId: string, userId: string) {
    return prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  },

  async listMembers(organizationId: string, query: OrganizationMemberQuery) {
    const [items, total] = await Promise.all([
      prisma.organizationMembership.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: "asc" },
        ...toSkipTake(query),
      }),
      prisma.organizationMembership.count({ where: { organizationId } }),
    ]);
    return { items, total };
  },

  createMembership(organizationId: string, userId: string, role: OrgRole) {
    return prisma.organizationMembership.create({
      data: { organizationId, userId, role },
      include: { user: { select: { id: true, email: true } } },
    });
  },

  /** Hard delete — membership carries no independent history worth
   * retaining once revoked (unlike Session, which keeps revoked rows
   * around for the reuse-detection audit trail). The ORG_MEMBER_REVOKED
   * audit log entry is the durable record that this happened. */
  revokeMembership(organizationId: string, userId: string) {
    return prisma.organizationMembership.deleteMany({ where: { organizationId, userId } });
  },

  /** Invalidates any prior unconsumed invite for this exact (org, email)
   * pair before issuing a new one — the same "latest link wins" pattern
   * auth.repository.ts uses for password-reset tokens. */
  async createInvite(input: {
    organizationId: string;
    email: string;
    role: OrgRole;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }) {
    await prisma.organizationInvite.updateMany({
      where: { organizationId: input.organizationId, email: input.email, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return prisma.organizationInvite.create({ data: input });
  },

  findValidInvite(tokenHash: string) {
    return prisma.organizationInvite.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  consumeInvite(id: string) {
    return prisma.organizationInvite.update({ where: { id }, data: { consumedAt: new Date() } });
  },

  async memberUserIds(organizationId: string): Promise<string[]> {
    const rows = await prisma.organizationMembership.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    return rows.map((r: { userId: string }) => r.userId);
  },

  /**
   * Cohort size = distinct members who logged at least one symptom in
   * range, not raw membership count — a member who never logs
   * shouldn't count toward "enough people reported this" the way an
   * active one does. Returns both the cohort size and the per-category
   * counts so the service layer can apply the k-anonymity floor before
   * deciding whether to return the categories at all.
   */
  async symptomFrequencyForMembers(
    memberUserIds: string[],
    query: OrgTrendsQuery,
  ): Promise<{ cohortSize: number; categories: Array<{ category: string; count: number }> }> {
    if (memberUserIds.length === 0) {
      return { cohortSize: 0, categories: [] };
    }

    const [cohortRows, categoryRows] = await Promise.all([
      prisma.symptomLog.groupBy({
        by: ["userId"],
        where: {
          userId: { in: memberUserIds },
          ...(query.from || query.to
            ? {
                occurredAt: {
                  ...(query.from ? { gte: query.from } : {}),
                  ...(query.to ? { lte: query.to } : {}),
                },
              }
            : {}),
        },
      }),
      prisma.symptomLog.groupBy({
        by: ["category"],
        where: {
          userId: { in: memberUserIds },
          ...(query.from || query.to
            ? {
                occurredAt: {
                  ...(query.from ? { gte: query.from } : {}),
                  ...(query.to ? { lte: query.to } : {}),
                },
              }
            : {}),
        },
        _count: { category: true },
      }),
    ]);

    return {
      cohortSize: cohortRows.length,
      categories: categoryRows.map((row: { category: string; _count: { category: number } }) => ({
        category: row.category,
        count: row._count.category,
      })),
    };
  },
};
