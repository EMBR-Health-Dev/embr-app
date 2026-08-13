import { prisma } from "../../lib/prisma.js";

export const briefRepository = {
  create(data: {
    userId: string;
    fromDate: Date;
    toDate: Date;
    symptomSummary: unknown;
    cycleSummary: unknown;
    aiNarrative: string;
    aiDiscussionTopics: string[];
  }) {
    return prisma.clinicalBrief.create({ data });
  },

  listForUser(userId: string, page: number, pageSize: number) {
    return Promise.all([
      prisma.clinicalBrief.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.clinicalBrief.count({ where: { userId } }),
    ]);
  },

  /** Scoped to userId in the query itself, not checked after the fact
   * — a brief containing another person's health data must never be
   * fetchable by guessing an ID, not even to correctly 404 it. */
  findByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.findFirst({ where: { id, userId } });
  },

  deleteByIdForUser(id: string, userId: string) {
    return prisma.clinicalBrief.deleteMany({ where: { id, userId } });
  },
};
