import type { MrsCheckInQuery, SaveMrsCheckInInput } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { MRS_INSTRUMENT_VERSION } from "./mrs-scoring.js";

/** A check-in is a whole year of monthly rows at most, so a person's
 * list is small; this cap only bounds a pathological account. */
const MRS_ROW_CAP = 500;

function calendarDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Every query is scoped to userId (same rule as note.repository.ts). */
export const mrsRepository = {
  save(userId: string, date: string, input: SaveMrsCheckInInput) {
    const completedOn = calendarDate(date);
    const data = {
      locale: input.locale,
      instrumentVersion: MRS_INSTRUMENT_VERSION[input.locale],
      ...input.answers,
    };
    return prisma.mrsCheckIn.upsert({
      where: { userId_completedOn: { userId, completedOn } },
      create: { userId, completedOn, ...data },
      update: data,
    });
  },

  list(userId: string, query: MrsCheckInQuery) {
    return prisma.mrsCheckIn.findMany({
      where: {
        userId,
        ...(query.from || query.to
          ? {
              completedOn: {
                ...(query.from ? { gte: calendarDate(query.from) } : {}),
                ...(query.to ? { lte: calendarDate(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { completedOn: "asc" },
      take: MRS_ROW_CAP,
    });
  },

  async delete(userId: string, date: string): Promise<boolean> {
    const result = await prisma.mrsCheckIn.deleteMany({
      where: { userId, completedOn: calendarDate(date) },
    });
    return result.count > 0;
  },
};
