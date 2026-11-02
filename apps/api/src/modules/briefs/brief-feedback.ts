import { AppError } from "@embr/shared";
import type { BriefFeedbackDto } from "@embr/types";
import type { BriefFeedbackInput } from "@embr/validation";
import { prisma } from "../../lib/prisma.js";

/**
 * The appointment follow up: "Did your EMBR BRIEF help you communicate
 * your symptoms or concerns during your appointment?" One answer per
 * brief, which she can change. The optional comment is encrypted at
 * rest (field-crypto.ts), never sent to the AI, never logged and never
 * shown in admin metrics, which count answers only.
 */
function toDto(row: {
  briefId: string;
  answer: BriefFeedbackDto["answer"];
  comment: string | null;
  updatedAt: Date;
}): BriefFeedbackDto {
  return {
    briefId: row.briefId,
    answer: row.answer,
    comment: row.comment,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertOwnBrief(briefId: string, userId: string): Promise<void> {
  // Scoped by userId: someone else's brief id reads as not found.
  const brief = await prisma.clinicalBrief.findFirst({
    where: { id: briefId, userId },
    select: { id: true },
  });
  if (!brief) throw AppError.notFound("Brief");
}

export const briefFeedbackService = {
  async get(briefId: string, userId: string): Promise<BriefFeedbackDto | null> {
    await assertOwnBrief(briefId, userId);
    const row = await prisma.briefFeedback.findFirst({ where: { briefId, userId } });
    return row ? toDto(row) : null;
  },

  async save(
    briefId: string,
    userId: string,
    input: BriefFeedbackInput,
  ): Promise<BriefFeedbackDto> {
    await assertOwnBrief(briefId, userId);
    const row = await prisma.briefFeedback.upsert({
      where: { briefId },
      create: { briefId, userId, answer: input.answer, comment: input.comment },
      update: { answer: input.answer, comment: input.comment },
    });
    return toDto(row);
  },
};
