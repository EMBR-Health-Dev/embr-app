import type { NewConsentRecord } from "../../src/modules/consent/consent.repository.js";

/**
 * In-memory stand-in for consentRepository, registered for every suite
 * by test/setup.ts. Most route suites replace Prisma with a per-file
 * in-memory mock that has no consentRecord model; this keeps the consent
 * ledger realistic (append-only rows, latest-per-type reads) without
 * every suite having to grow one. The real queries are covered against
 * Postgres by test/integration/consent-repository.test.ts.
 */

interface StoredRecord extends NewConsentRecord {
  id: string;
  client: string | null;
  createdAt: Date;
}

const store: StoredRecord[] = [];
let seq = 0;

export function resetFakeConsentStore() {
  store.length = 0;
}

function insert(record: NewConsentRecord): StoredRecord {
  seq += 1;
  const row: StoredRecord = {
    ...record,
    client: record.client ?? null,
    id: `consent-${seq}`,
    // Strictly increasing, so "latest" is unambiguous even for rows
    // written in the same millisecond.
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq),
  };
  store.push(row);
  return row;
}

function newestFirst(rows: StoredRecord[]) {
  return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function latestBy(rows: StoredRecord[], key: (r: StoredRecord) => string) {
  const seen = new Set<string>();
  return newestFirst(rows).filter((r) => {
    const k = key(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const consentRepository = {
  async createUserWithConsents(
    user: { email: string; passwordHash: string },
    records: Array<Omit<NewConsentRecord, "userId">>,
  ) {
    // Whatever Prisma the current suite uses (usually its own mock).
    const { prisma } = await import("../../src/lib/prisma.js");
    const created = await prisma.user.create({ data: user });
    records.forEach((r) => insert({ ...r, userId: created.id }));
    return created;
  },

  async insertMany(records: NewConsentRecord[]) {
    records.forEach(insert);
    return { count: records.length };
  },

  async latestPerType(userIds: string[]) {
    return latestBy(
      store.filter((r) => userIds.includes(r.userId)),
      (r) => `${r.userId}:${r.type}`,
    );
  },

  async latestOfTypeForUsers(userIds: string[], type: NewConsentRecord["type"]) {
    return latestBy(
      store.filter((r) => userIds.includes(r.userId) && r.type === type),
      (r) => r.userId,
    );
  },

  async history(userId: string) {
    return newestFirst(store.filter((r) => r.userId === userId));
  },
};
