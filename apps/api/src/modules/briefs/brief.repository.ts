import { prisma, Prisma } from "../../lib/prisma.js";

import { toSkipTake } from "../../lib/pagination.js";

import type { PaginationQuery } from "@embr/validation";

export const briefRepository = {
  /**
   * Second line of defense against the same double-generation this
   * flow's Redis lock (see brief.service.ts) exists to prevent in the
   * first place: the lock is best-effort (a Redis outage, or a
   * generation that outlives the lock's TTL, both fail it open), so a
   * unique index on (userId, fromDate, toDate) is what actually makes
   * a duplicate impossible at the data layer. A caller racing in after
   * someone else already won gets that same, already-persisted brief
   * back rather than an error — its own (wasted) generation work isn't
   * un-done, but the request still resolves to a valid brief instead
   * of failing.
   */
  async create(data: {
    userId: string;
    fromDate: Date;
    toDate: Date;
    symptomSummary: Prisma.InputJsonValue;
    cycleSummary: Prisma.InputJsonValue;
    treatmentSummary: Prisma.InputJsonValue;
    frequencyComparison: Prisma.InputJsonValue;
    coOccurrence: Prisma.InputJsonValue | null;
    treatmentImpact: Prisma.InputJsonValue;
    persistentSymptoms: Prisma.InputJsonValue;
    interpretation: Prisma.InputJsonValue;
    citedPatternIds: Prisma.InputJsonValue;
    aiNarrative: string;
    aiDiscussionTopics: Prisma.InputJsonValue;
  }) {
    try {
      return await prisma.clinicalBrief.create({
        data: {
          ...data,
          // Prisma.JsonNull, not the bare null the caller passed --
          // since Prisma 3.0, nullable Json?/create-input fields don't
          // accept a plain null literal in their type (ambiguous
          // between "SQL NULL" and "the JSON literal null"), so the
          // generated NullableJsonNullValueInput type requires this
          // sentinel instead. Confined to this one line rather than
          // pushed onto every caller: brief.service.ts (the only
          // caller) keeps passing a plain, ergonomic `null` exactly as
          // it always has, and this is the one place that actually
          // talks to Prisma's real create() shape, so it's the one
          // place that needs to know about this Prisma-specific detail.
          // Sourced from lib/prisma.js (not a direct generated-client
          // import) so this stays reachable through the same,
          // already-mocked path every test already relies on for
          // `prisma` itself — see brief.test.ts's Prisma.JsonNull mock.
          coOccurrence: data.coOccurrence ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      // Prisma's unique-constraint violation code — same check
      // billing.repository.ts's recordWebhookEventIfNew already uses
      // for the same "someone else's concurrent write won" shape. Any
      // other error still surfaces.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        const existing = await prisma.clinicalBrief.findFirst({
          where: { userId: data.userId, fromDate: data.fromDate, toDate: data.toDate },
          orderBy: { createdAt: "desc" },
        });
        if (existing) return existing;
      }
      throw err;
    }
  },

  listForUser(userId: string, query: PaginationQuery) {
    return Promise.all([
      prisma.clinicalBrief.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        ...toSkipTake(query),
      }),
      prisma.clinicalBrief.count({ where: { userId } }),
    ]);
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.findFirst({
      where: { id, userId },
    });
  },

  deleteByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.deleteMany({
      where: { id, userId },
    });
  },
};
