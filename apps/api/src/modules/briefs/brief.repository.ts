import { prisma, Prisma } from "../../lib/prisma.js";

import { toSkipTake } from "../../lib/pagination.js";

import type { PaginationQuery } from "@embr/validation";

export const briefRepository = {
  create(data: {
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
    return prisma.clinicalBrief.create({
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
