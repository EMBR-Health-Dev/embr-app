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
   * The transaction alone does NOT make the read-then-write safe: it
   * runs under Postgres's default READ COMMITTED isolation, and an
   * unlocked `count()` is just a plain SELECT. Two concurrent revokes
   * of two *different* admins can both read a count of 2, both decide
   * "an admin remains," and both delete — leaving zero ORG_ADMINs.
   * READ COMMITTED does not serialize transactions against each other
   * by itself; only an actual lock (or SERIALIZABLE + retry) does.
   *
   * The fix: before counting, take `SELECT ... FOR UPDATE` on every
   * ORG_ADMIN membership row for this organization. This blocks a
   * second concurrent revoke of another admin in the same org until
   * the first transaction commits or rolls back — at which point the
   * second transaction's own FOR UPDATE re-reads the *post-commit*
   * row set (READ COMMITTED re-evaluates a blocked row's visibility
   * once the blocking transaction ends), so it sees the real,
   * up-to-date admin count rather than a stale snapshot. `ORDER BY id`
   * makes every transaction acquire these row locks in the same
   * global order, which rules out a lock-ordering deadlock between two
   * transactions racing to lock the same two rows in opposite order.
   *
   * Locking the admin rows (rather than the parent Organization row)
   * keeps this scoped to exactly the invariant being protected:
   * concurrent revokes of *non-admin* members in the same org are
   * unaffected and don't block on each other. */
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
        // Row-locks every ORG_ADMIN membership for this org before
        // counting — see the doc comment above for why the count alone
        // (even inside a transaction) isn't safe against a concurrent
        // revoke of a different admin. Parameterized via Prisma's
        // tagged-template $queryRaw; never string-interpolate values
        // into raw SQL.
        const lockedAdmins = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM organization_memberships
          WHERE "organizationId" = ${organizationId} AND role = 'ORG_ADMIN'
          ORDER BY id
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
