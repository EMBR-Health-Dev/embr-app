import type {
  CycleEntryQuery,
  UpdateCycleEntryInput,
  UpsertCycleEntryInput,
} from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

/**
 * Same ownership-scoping rule as symptomRepository: every lookup by id
 * filters on userId too, so a non-owned id is indistinguishable from a
 * nonexistent one.
 */
export const cycleRepository = {
  /** Create-or-replace for the given date, relying on the
   * @@unique([userId, date]) constraint — logging the same day twice
   * (e.g. correcting a mistaken flow entry) overwrites rather than
   * erroring or duplicating. */
  upsertByDate(userId: string, input: UpsertCycleEntryInput) {
    return prisma.cycleEntry.upsert({
      where: { userId_date: { userId, date: input.date } },
      create: {
        userId,
        date: input.date,
        flow: input.flow ?? null,
        isPeriodStart: input.isPeriodStart ?? false,
        isPeriodEnd: input.isPeriodEnd ?? false,
        notes: input.notes ?? null,
      },
      update: {
        flow: input.flow ?? null,
        isPeriodStart: input.isPeriodStart ?? false,
        isPeriodEnd: input.isPeriodEnd ?? false,
        notes: input.notes ?? null,
      },
    });
  },

  async list(userId: string, query: CycleEntryQuery) {
    const where = {
      userId,
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.cycleEntry.findMany({
        where,
        orderBy: { date: "desc" },
        ...toSkipTake(query),
      }),
      prisma.cycleEntry.count({ where }),
    ]);

    return { items, total };
  },

  findById(userId: string, id: string) {
    return prisma.cycleEntry.findFirst({ where: { id, userId } });
  },

  async update(userId: string, id: string, input: UpdateCycleEntryInput) {
    const result = await prisma.cycleEntry.updateMany({
      where: { id, userId },
      data: {
        ...(input.flow !== undefined ? { flow: input.flow } : {}),
        ...(input.isPeriodStart !== undefined ? { isPeriodStart: input.isPeriodStart } : {}),
        ...(input.isPeriodEnd !== undefined ? { isPeriodEnd: input.isPeriodEnd } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    if (result.count === 0) return null;
    return prisma.cycleEntry.findFirst({ where: { id, userId } });
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.cycleEntry.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
