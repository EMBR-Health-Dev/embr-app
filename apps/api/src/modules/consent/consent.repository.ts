import { prisma } from "../../lib/prisma.js";

export interface NewConsentRecord {
  userId: string;
  type: "TERMS" | "PRIVACY" | "HEALTH_PROCESSING";
  version: string;
  locale: "en" | "ja";
  action: "GRANTED" | "WITHDRAWN";
  source: "REGISTRATION" | "CONSENT_SCREEN" | "SETTINGS";
  client?: string | null;
}

/**
 * Every read and write of consent records goes through here — nothing
 * else in the codebase touches prisma.consentRecord — so the whole
 * ledger has one small, well-defined surface (also what test/setup.ts
 * replaces with an in-memory fake for route-level suites).
 */
export const consentRepository = {
  /**
   * Creates an account together with its registration consent records
   * in a single nested write, which Prisma executes atomically: there is
   * never an account without the acceptances it was created with.
   */
  createUserWithConsents(
    user: { email: string; passwordHash: string },
    records: Array<Omit<NewConsentRecord, "userId">>,
  ) {
    return prisma.user.create({
      data: { ...user, consentRecords: { create: records } },
    });
  },

  /** Append-only: rows are only ever inserted, never updated. */
  insertMany(records: NewConsentRecord[]) {
    return prisma.consentRecord.createMany({ data: records });
  },

  /** Each user's most recent row per consent type. */
  latestPerType(userIds: string[]) {
    return prisma.consentRecord.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["userId", "type"],
    });
  },

  /** Each user's most recent row for one consent type. */
  latestOfTypeForUsers(userIds: string[], type: NewConsentRecord["type"]) {
    return prisma.consentRecord.findMany({
      where: { userId: { in: userIds }, type },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
    });
  },

  history(userId: string) {
    return prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },
};
