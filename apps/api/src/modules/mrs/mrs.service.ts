import type { MrsCheckInQuery, SaveMrsCheckInInput } from "@embr/validation";
import type { MrsCheckInDto } from "@embr/types";
import { AppError } from "@embr/shared";
import { mrsRepository } from "./mrs.repository.js";
import { toMrsCheckInDto } from "./mrs.mappers.js";

const DAY_MS = 86_400_000;

/** Her local date can run up to 14 hours ahead of UTC, so tomorrow in
 * UTC is the latest date a real check-in can carry. */
function isInFuture(date: string, now: Date): boolean {
  const latest = new Date(now.getTime() + DAY_MS).toISOString().slice(0, 10);
  return date > latest;
}

export const mrsService = {
  async save(
    userId: string,
    date: string,
    input: SaveMrsCheckInInput,
    now = new Date(),
  ): Promise<MrsCheckInDto> {
    if (isInFuture(date, now)) {
      throw AppError.validation("A check-in cannot be dated in the future", [
        { field: "date", message: "Must not be in the future" },
      ]);
    }
    return toMrsCheckInDto(await mrsRepository.save(userId, date, input));
  },

  async list(userId: string, query: MrsCheckInQuery): Promise<MrsCheckInDto[]> {
    return (await mrsRepository.list(userId, query)).map(toMrsCheckInDto);
  },

  async delete(userId: string, date: string): Promise<void> {
    if (!(await mrsRepository.delete(userId, date))) throw AppError.notFound("Check-in");
  },
};
