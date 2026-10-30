import type { ContextLogQuery, UpsertContextLogInput } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { calendarDateBounds } from "../../lib/local-day-label.js";
import { toSkipTake } from "../../lib/pagination.js";

/** Same ownership-scoping rule as cycleRepository/symptomRepository:
 * every lookup by id filters on userId too, so a non-owned id is
 * indistinguishable from a nonexistent one. */
export const contextRepository = {
  /** Create-or-replace for the given date, relying on the
   * @@unique([userId, date]) constraint — logging the same day twice
   * (e.g. adding a factor noticed later) overwrites rather than
   * erroring or duplicating. Mirrors cycleRepository.upsertByDate. */
  upsertByDate(userId: string, input: UpsertContextLogInput) {
    return prisma.contextLog.upsert({
      where: { userId_date: { userId, date: input.date } },
      create: {
        userId,
        date: input.date,
        sleepDuration: input.sleepDuration ?? null,
        caffeineAfternoon: input.caffeineAfternoon ?? null,
        alcohol: input.alcohol ?? null,
        stressLevel: input.stressLevel ?? null,
        nightSweats: input.nightSweats ?? null,
        workImpact: input.workImpact ?? null,
        exercise: input.exercise ?? null,
        socialImpact: input.socialImpact ?? null,
      },
      update: {
        sleepDuration: input.sleepDuration ?? null,
        caffeineAfternoon: input.caffeineAfternoon ?? null,
        alcohol: input.alcohol ?? null,
        stressLevel: input.stressLevel ?? null,
        nightSweats: input.nightSweats ?? null,
        workImpact: input.workImpact ?? null,
        // Left out means keep it (see upsertContextLogSchema).
        ...(input.exercise !== undefined ? { exercise: input.exercise } : {}),
        ...(input.socialImpact !== undefined ? { socialImpact: input.socialImpact } : {}),
      },
    });
  },

  async list(userId: string, query: ContextLogQuery) {
    const days = calendarDateBounds(query);
    const where = {
      userId,
      ...(days.from || days.to
        ? {
            date: {
              ...(days.from ? { gte: days.from } : {}),
              ...(days.to ? { lte: days.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contextLog.findMany({
        where,
        orderBy: { date: "desc" },
        ...toSkipTake(query),
      }),
      prisma.contextLog.count({ where }),
    ]);

    return { items, total };
  },
};
