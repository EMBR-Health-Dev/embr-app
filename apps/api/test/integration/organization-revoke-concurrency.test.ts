import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Deliberately NOT mocking ../../src/lib/prisma.js in this file — that
 * mock (see organization.test.ts) runs `$transaction`'s callback
 * directly against a plain JS object and therefore cannot model real
 * Postgres transaction isolation, row locking, or blocking/retry
 * behavior. The whole point of this file is to exercise
 * organizationRepository.revokeMembership against an actual Postgres
 * instance so the FOR UPDATE fix is verified against the real
 * mechanism it depends on, not a simulation of it.
 */
const { isPostgresReachable } = await import("./postgres-reachable.js");
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://embr:test@localhost:5432/embr_test?schema=public";
const postgresReachable = await isPostgresReachable(databaseUrl);

describe.skipIf(!postgresReachable)("revokeMembership concurrency against a real Postgres", () => {
  let prisma: (typeof import("../../src/lib/prisma.js"))["prisma"];
  let organizationRepository: (typeof import("../../src/modules/organizations/organization.repository.js"))["organizationRepository"];

  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ prisma } = await import("../../src/lib/prisma.js"));
    ({ organizationRepository } =
      await import("../../src/modules/organizations/organization.repository.js"));
  });

  afterEach(async () => {
    // Cascades to organization_memberships (onDelete: Cascade in
    // schema.prisma) — deleting the org is enough to clean up its
    // memberships too.
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdOrgIds.length = 0;
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeUser() {
    const user = await prisma.user.create({
      data: {
        email: `concurrency-${randomUUID()}@embr.health`,
        passwordHash: "not-a-real-hash",
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function makeOrg() {
    const org = await prisma.organization.create({
      data: { name: "Concurrency Test Org", slug: `concurrency-${randomUUID()}` },
    });
    createdOrgIds.push(org.id);
    return org.id;
  }

  async function addAdmin(organizationId: string, userId: string) {
    await prisma.organizationMembership.create({
      data: { organizationId, userId, role: "ORG_ADMIN" },
    });
  }

  /**
   * The exact race described in the defect: two ORG_ADMINs of the
   * same two-admin org each try to revoke the *other* admin at the
   * same time. Before the FOR UPDATE fix, both transactions could
   * read the pre-delete count of 2 under READ COMMITTED and both
   * proceed, leaving zero admins. With the fix, the second
   * transaction's row lock blocks until the first commits, then
   * re-reads the real (now-1) admin count and correctly reports
   * LAST_ADMIN instead of deleting.
   */
  it("never lets two concurrent revokes of different admins leave zero ORG_ADMINs", async () => {
    const organizationId = await makeOrg();
    const adminAId = await makeUser();
    const adminBId = await makeUser();
    await addAdmin(organizationId, adminAId);
    await addAdmin(organizationId, adminBId);

    const [resultA, resultB] = await Promise.all([
      organizationRepository.revokeMembership(organizationId, adminBId),
      organizationRepository.revokeMembership(organizationId, adminAId),
    ]);

    // Exactly one side must win and one must be rejected as the last
    // admin — never both REVOKED, which is the invariant violation
    // this fix exists to prevent.
    const results = [resultA, resultB].sort();
    expect(results).toEqual(["LAST_ADMIN", "REVOKED"]);

    const remainingAdmins = await prisma.organizationMembership.count({
      where: { organizationId, role: "ORG_ADMIN" },
    });
    expect(remainingAdmins).toBe(1);
  });

  /**
   * Same race, but with a third admin present who isn't part of
   * either concurrent call — both revokes of adminA/adminB should
   * succeed since the org never drops below one admin (adminC always
   * remains), confirming the lock doesn't over-block legitimate
   * concurrent revocations.
   */
  it("allows both concurrent revokes to succeed when a third admin keeps the invariant satisfied", async () => {
    const organizationId = await makeOrg();
    const adminAId = await makeUser();
    const adminBId = await makeUser();
    const adminCId = await makeUser();
    await addAdmin(organizationId, adminAId);
    await addAdmin(organizationId, adminBId);
    await addAdmin(organizationId, adminCId);

    const [resultA, resultB] = await Promise.all([
      organizationRepository.revokeMembership(organizationId, adminAId),
      organizationRepository.revokeMembership(organizationId, adminBId),
    ]);

    expect(resultA).toBe("REVOKED");
    expect(resultB).toBe("REVOKED");

    const remainingAdmins = await prisma.organizationMembership.count({
      where: { organizationId, role: "ORG_ADMIN" },
    });
    expect(remainingAdmins).toBe(1);
  });
});
