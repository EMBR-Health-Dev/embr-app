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
    // startDate/endDate are @db.Date columns — pure calendar dates,
    // always written and read without a time-of-day component (see
    // cycle.mappers.ts's identical doc comment on why). Every stored
    // value gets there via z.coerce.date() on a "YYYY-MM-DD" string,
    // which resolves to UTC midnight of that day per ISO 8601. "today"
    // for the active-status comparison below must be constructed the
    // same way — a bare `new Date()` carries the current time-of-day,
    // which for a user in a timezone ahead of UTC (JST, UTC+9, a real
    // population for this app) means the server's UTC calendar date
    // can still be "yesterday" for several hours after that user's own
    // local date — and therefore the treatment they just logged as
    // starting "today" — has already rolled over. Truncating to UTC
    // midnight here keeps both sides of every comparison expressed as
    // the same kind of value: a calendar date, not an instant.
    const today = new Date(new Date().toISOString().slice(0, 10));
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

  /** Two true DB-side COUNT aggregates (not fetched rows) — matches
   * trends.repository.ts's own documented preference for
   * Postgres-side aggregation over fetching and counting in
   * application code, for exactly the same reason: nothing here needs
   * the individual log rows, only how many exist in each window. */
  async countSymptomLogsInWindows(
    userId: string,
    windows: { before: { from: Date; to: Date }; after: { from: Date; to: Date } },
  ): Promise<{ beforeLogCount: number; afterLogCount: number }> {
    const [beforeLogCount, afterLogCount] = await Promise.all([
      prisma.symptomLog.count({
        where: { userId, occurredAt: { gte: windows.before.from, lt: windows.before.to } },
      }),
      prisma.symptomLog.count({
        where: { userId, occurredAt: { gte: windows.after.from, lt: windows.after.to } },
      }),
    ]);
    return { beforeLogCount, afterLogCount };
  },

  /** Every treatment that overlaps [fromDate, toDate] at all — not just
   * ones that started inside the range. An ongoing treatment (endDate
   * null) that started before fromDate must still appear, since it was
   * genuinely active throughout the period; a treatment that only
   * touches the range for a single day at either edge still counts as
   * "during this period." Ordered by startDate descending, matching
   * list()'s existing convention above.
   *
   * Used only at BRIEF generation time (see brief.service.ts) — never
   * called on brief read/PDF-download, which is what keeps a
   * previously generated BRIEF from silently changing if treatments
   * are edited or deleted afterward. */
  listOverlappingRange(userId: string, fromDate: Date, toDate: Date) {
    return prisma.treatment.findMany({
      where: {
        userId,
        startDate: { lte: toDate },
        OR: [{ endDate: null }, { endDate: { gte: fromDate } }],
      },
      orderBy: { startDate: "desc" },
    });
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
