import type {
  CreateOrganizationInput,
  OrganizationMemberQuery,
  OrgTrendsQuery,
} from "@embr/validation";
import type { OrgRole } from "@embr/types";
import type { Prisma } from "../../generated/prisma/index.js";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

const ORG_ACTIVITY_ROW_CAP = 50000;

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
   * audit log entry is the durable record that this happened.
   *
   * Enforces the "an organization always retains at least one
   * ORG_ADMIN" invariant server-side — this is the actual security
   * boundary; any frontend confirmation dialog is UX only.
   *
   * Concurrency: a plain transactional count()-then-delete is NOT
   * sufficient here. Under Postgres's default READ COMMITTED isolation,
   * an unlocked COUNT does not block on a concurrent transaction's
   * uncommitted DELETE, so two admins revoking each other at the same
   * instant could each independently read adminCount=2, each decide
   * it's safe, and both commit — leaving zero admins. A transaction
   * alone doesn't prevent that; only an explicit lock on the contested
   * rows does.
   *
   * So when the target is an ORG_ADMIN, this takes out a row lock via
   * `SELECT ... FOR UPDATE` on every ORG_ADMIN membership row for the
   * organization *before* deciding anything. If a second revoke for a
   * different admin in the same org is racing this one, its own
   * `FOR UPDATE` blocks until this transaction commits or rolls back —
   * there is no window where both transactions can observe the
   * pre-delete admin count at once. Whichever transaction acquires the
   * lock first proceeds and (if it deletes) commits; the other then
   * acquires the lock against the *post-delete* row set and correctly
   * sees the reduced count. Non-admin targets skip this entirely — the
   * invariant only exists for ORG_ADMIN, so there's nothing to lock. */
  async revokeMembership(
    organizationId: string,
    userId: string,
  ): Promise<"REVOKED" | "NOT_FOUND" | "LAST_ADMIN"> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const target = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (!target) return "NOT_FOUND";

      if (target.role === "ORG_ADMIN") {
        // Locks the current ORG_ADMIN rows for this org and holds the
        // lock for the rest of this transaction — see the concurrency
        // note above. Parameterized via Prisma's tagged-template
        // $queryRaw; the 'ORG_ADMIN' literal is fixed, never
        // interpolated from caller input.
        const lockedAdmins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "organization_memberships"
          WHERE "organizationId" = ${organizationId}
            AND "role" = 'ORG_ADMIN'::"OrgRole"
          FOR UPDATE
        `;
        if (lockedAdmins.length <= 1) return "LAST_ADMIN";
      }

      await tx.organizationMembership.delete({
        where: { organizationId_userId: { organizationId, userId } },
      });
      return "REVOKED";
    });
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

  /** userId + createdAt for every accepted membership — the join date
   * is what anchors each member's own 30-day activation window (see
   * organization.activation.ts), so this can't reuse memberUserIds
   * above, which deliberately only selects userId. */
  async membershipsForActivation(
    organizationId: string,
  ): Promise<Array<{ userId: string; createdAt: Date }>> {
    return prisma.organizationMembership.findMany({
      where: { organizationId },
      select: { userId: true, createdAt: true },
    });
  },

  /** Raw activity rows for a set of members, from the earliest
   * relevant date onward — bounded by ORG_ACTIVITY_ROW_CAP below as a
   * safety ceiling, not a real pagination story, the same reasoning as
   * trends.repository.ts's CYCLE_ENTRY_ROW_CAP/SYMPTOM_LOG_ROW_CAP.
   * Sized larger than those (this can span an entire cohort's activity
   * across a 30-day window, not one user's) — not benchmarked against
   * real production scale yet, unlike trends.repository.ts's own
   * measured note; revisit if this ever becomes a real bottleneck. */
  async activityForMembers(
    memberUserIds: string[],
    earliestDate: Date,
  ): Promise<{
    symptomActivity: Array<{ userId: string; occurredAt: Date }>;
    cycleActivity: Array<{ userId: string; occurredAt: Date }>;
  }> {
    if (memberUserIds.length === 0) {
      return { symptomActivity: [], cycleActivity: [] };
    }

    const [symptomLogs, cycleEntries] = await Promise.all([
      prisma.symptomLog.findMany({
        where: { userId: { in: memberUserIds }, occurredAt: { gte: earliestDate } },
        select: { userId: true, occurredAt: true },
        take: ORG_ACTIVITY_ROW_CAP,
      }),
      prisma.cycleEntry.findMany({
        where: { userId: { in: memberUserIds }, date: { gte: earliestDate } },
        select: { userId: true, date: true },
        take: ORG_ACTIVITY_ROW_CAP,
      }),
    ]);

    return {
      symptomActivity: symptomLogs,
      // CycleEntry's activity timestamp is `date`, not `occurredAt` —
      // normalized to the same field name here so the caller can merge
      // both arrays without needing to know which table each row came
      // from, matching computeActivatedUserIds/computeWeeklyActiveUserIds's
      // single LoggedActivityRow shape.
      cycleActivity: cycleEntries.map((e: { userId: string; date: Date }) => ({
        userId: e.userId,
        occurredAt: e.date,
      })),
    };
  },

  /**
   * Cohort size = distinct members who logged at least one symptom in
   * range, not raw membership count — a member who never logs
   * shouldn't count toward "enough people reported this" the way an
   * active one does. Returns both the cohort size and the per-category
   * counts so the service layer can apply the k-anonymity floor before
   * deciding whether to return the categories at all.
   *
   * Index note (reviewed against ~8.7M rows / 50k users, a 500-member
   * cohort — see PR for methodology): the existing `symptom_logs
   * (userId, occurredAt)` index is exactly right for the common case, a
   * date-bounded query (~20ms, index-only scan). An unbounded query
   * (`query.from`/`query.to` both omitted) genuinely is slow at that
   * scale (~1.9s) — but *adding* an index doesn't fix it. Forcing the
   * existing index via `enable_seqscan = off` made it slower (4.4s), not
   * faster: 500 essentially-random userIds scattered across 50k don't
   * cluster in index order, so a parallel sequential scan legitimately
   * beats index probing here regardless of which columns are indexed.
   * If the unbounded case becomes a real problem, the fix is caching or
   * a precomputed rollup, not a schema change — don't add an index here
   * without re-running this analysis against then-current data first.
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
