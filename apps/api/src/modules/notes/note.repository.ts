import type { CreateNoteInput, NoteQuery, UpdateNoteInput } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";
import { toSkipTake } from "../../lib/pagination.js";

/** Every query is scoped to userId, including lookups by id, so a note
 * that belongs to someone else behaves exactly like one that does not
 * exist (same rule as treatment.repository.ts). */
export const noteRepository = {
  create(userId: string, input: CreateNoteInput) {
    return prisma.note.create({
      data: { userId, title: input.title, body: input.body, cover: input.cover },
    });
  },

  async list(userId: string, query: NoteQuery) {
    const where = { userId };
    const [items, total] = await Promise.all([
      prisma.note.findMany({ where, orderBy: { updatedAt: "desc" }, ...toSkipTake(query) }),
      prisma.note.count({ where }),
    ]);
    return { items, total };
  },

  findById(userId: string, id: string) {
    return prisma.note.findFirst({ where: { id, userId } });
  },

  async update(userId: string, id: string, input: UpdateNoteInput) {
    const result = await prisma.note.updateMany({ where: { id, userId }, data: input });
    if (result.count === 0) return null;
    return prisma.note.findFirst({ where: { id, userId } });
  },

  async delete(userId: string, id: string): Promise<boolean> {
    const result = await prisma.note.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },
};
