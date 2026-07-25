import type {
  CreateSymptomLogInput,
  SymptomLogQuery,
  UpdateSymptomLogInput,
} from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

/**
 * Every query here is scoped to `userId` — including single-record
 * lookups by id, via a compound `where: { id, userId }` rather than
 * "fetch then check ownership in the service." A symptom log id that
 * exists but belongs to someone else must behave identically to an id
 * that doesn't exist at all (Prisma returns null either way), so the
 * route layer can return a plain 404 without ever confirming another
 * user's data exists.
 */
export const symptomRepository = {
  create(userId: string, input: CreateSymptomLogInput) {
    return prisma.symptomLog.create({
      data: {
        userId,
        category: input.category,
        severity: input.severity,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null,
      },
    });
  },

  async list(userId: string, query: SymptomLogQuery) {
    const where = {
      userId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.symptomLog.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        ...toSkipTake(query),
      }),
      prisma.symptomLog.count({ where }),
    ]);

    return { items, total };
  },

  findById(userId: string, id: string) {
    return prisma.symptomLog.findFirst({ where: { id, userId } });
  },

  async update(userId: string, id: string, input: UpdateSymptomLogInput) {
    // updateMany (not update) so a non-owned id affects zero rows
    // instead of throwing Prisma's "record not found" error — the
    // service layer distinguishes "updated" vs "not found" from the count.
    const result = await prisma.symptomLog.updateMany({
      where: { id, userId },
      data: {
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.severity !== undefined ? { severity: input.severity } : {}),
        ...(input.occurredAt !== undefined ? { occurredAt: input.occurredAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    if (result.count === 0) return null;
    return prisma.symptomLog.findFirst({ where: { id, userId } });
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.symptomLog.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
