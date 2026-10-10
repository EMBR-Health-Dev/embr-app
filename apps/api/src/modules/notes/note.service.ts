import type { CreateNoteInput, NoteQuery, UpdateNoteInput } from "@embr/validation";
import type { NoteDto, PaginatedResponse } from "@embr/types";
import { AppError } from "@embr/shared";
import { paginate } from "../../lib/pagination.js";
import { noteRepository } from "./note.repository.js";
import { toNoteDto } from "./note.mappers.js";

export const noteService = {
  async create(userId: string, input: CreateNoteInput): Promise<NoteDto> {
    return toNoteDto(await noteRepository.create(userId, input));
  },

  async list(userId: string, query: NoteQuery): Promise<PaginatedResponse<NoteDto>> {
    const { items, total } = await noteRepository.list(userId, query);
    return paginate(items.map(toNoteDto), total, query);
  },

  async getById(userId: string, id: string): Promise<NoteDto> {
    const note = await noteRepository.findById(userId, id);
    if (!note) throw AppError.notFound("Note");
    return toNoteDto(note);
  },

  async update(userId: string, id: string, input: UpdateNoteInput): Promise<NoteDto> {
    const note = await noteRepository.update(userId, id, input);
    if (!note) throw AppError.notFound("Note");
    return toNoteDto(note);
  },

  async delete(userId: string, id: string): Promise<void> {
    if (!(await noteRepository.delete(userId, id))) throw AppError.notFound("Note");
  },
};
