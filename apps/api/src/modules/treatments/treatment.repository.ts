import type { CreateTreatmentInput, TreatmentQuery, UpdateTreatmentInput } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

/**
 * Every query here is scoped to `userId` — including single-record
 * lookups by id, via a compound `where: { id, userId }` rather than
 * "fetch then check ownership in the service." Same ownership-scoping
 * precedent as symptom.repository.ts: a treatment id that exists but
 * belongs to someone else must behave identically to an id that
 * doesn't exist at all.
 */
export const treatmentRepository = {
  create(userId: string, input: CreateTreatmentInput) {
    return prisma.treatment.create({
      data: {
        userId,
        name: input.name,
        category: input.category,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null,
      },
    });
  },

  async list(userId: string, query: TreatmentQuery) {
    const today = new Date();
    const where = {
      userId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.active
        ? {
            startDate: { lte: today },
            OR: [{ endDate: null }, { endDate: { gte: today } }],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.treatment.findMany({
        where,
        orderBy: { startDate: "desc" },
        ...toSkipTake(query),
      }),
      prisma.treatment.count({ where }),
    ]);

    return { items, total };
  },

  findById(userId: string, id: string) {
    return prisma.treatment.findFirst({ where: { id, userId } });
  },

  async update(userId: string, id: string, input: UpdateTreatmentInput) {
    // updateMany (not update) so a non-owned id affects zero rows
    // instead of throwing Prisma's "record not found" error — the
    // service layer distinguishes "updated" vs "not found" from the
    // count, same pattern as symptom.repository.ts.
    const result = await prisma.treatment.updateMany({
      where: { id, userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    if (result.count === 0) return null;
    return prisma.treatment.findFirst({ where: { id, userId } });
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.treatment.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
