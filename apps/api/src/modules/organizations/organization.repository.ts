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

  /** Every other organization route requires already knowing an
   * organizationId; this is the one query keyed by userId instead, so
   * a member (or a brand-new ORG_ADMIN) can discover what they belong
   * to at all. */
  listMembershipsForUser(userId: string) {
    return prisma.organizationMembership.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" },
    });
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

    const dateFilter = occurredAtFilter(query);

    const [cohortRows, categoryRows] = await Promise.all([
      prisma.symptomLog.groupBy({
        by: ["userId"],
        where: { userId: { in: memberUserIds }, ...dateFilter },
      }),
      prisma.symptomLog.groupBy({
        by: ["category"],
        where: { userId: { in: memberUserIds }, ...dateFilter },
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

/**
 * The optional `occurredAt` range filter shared by both groupBy queries
 * in symptomFrequencyForMembers. Previously the same `from`/`to` spread
 * logic was copy-pasted verbatim into each query's `where` clause; a
 * change to one (e.g. switching `to` from inclusive to exclusive) could
 * silently drift out of sync with the other. Returns `{}` — not
 * `{ occurredAt: undefined }` — when neither bound is set, so the key is
 * absent from `where` entirely, matching Prisma's "no filter on this
 * field" semantics exactly as the inline version did.
 */
function occurredAtFilter(query: OrgTrendsQuery): { occurredAt?: { gte?: Date; lte?: Date } } {
  if (!query.from && !query.to) return {};
  return {
    occurredAt: {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    },
  };
}
