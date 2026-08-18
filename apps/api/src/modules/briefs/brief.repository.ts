import type { Prisma } from "../../generated/prisma/index.js";

import { prisma } from "../../lib/prisma.js";

import { toSkipTake } from "../../lib/pagination.js";

import type { PaginationQuery } from "@embr/validation";

export const briefRepository = {
  create(data: {
    userId: string;
    fromDate: Date;
    toDate: Date;
    symptomSummary: Prisma.InputJsonValue;
    cycleSummary: Prisma.InputJsonValue;
    aiNarrative: string;
    aiDiscussionTopics: string[];
  }) {
    return prisma.clinicalBrief.create({ data });
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

  /**
   * Scoped to userId in the query itself, not checked after the fact.
   * A brief containing another person's health data must never be
   * fetchable by guessing an ID, not even to correctly 404 it.
   */
  findByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.findFirst({ where: { id, userId } });
  },

  deleteByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.deleteMany({ where: { id, userId } });
  },
};
