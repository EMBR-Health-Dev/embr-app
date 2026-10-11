import type { Note } from "../../generated/prisma/index.js";
import type { NoteCover, NoteDto } from "@embr/types";

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    title: note.title,
    body: note.body,
    cover: note.cover as NoteCover,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
