import { AppError } from "@embr/shared";
import type { BaselineCheckInDto, SaveBaselineCheckInResultDto } from "@embr/types";
import type { SaveBaselineCheckInInput } from "@embr/validation";
import type { BaselineCheckIn, BaselineCheckInSymptom } from "../../generated/prisma/index.js";
import { localDate } from "../trends/symptom-history.js";
import { consentRepository } from "../consent/consent.repository.js";
import { baselineRepository } from "./baseline.repository.js";

/** A tab left open a few days can still be saved; older is refused. */
const MAX_AGE_DAYS = 7;

type Row = BaselineCheckIn & { symptoms: BaselineCheckInSymptom[] };

export function toBaselineCheckInDto(row: Row): BaselineCheckInDto {
  return {
    id: row.id,
    completedOn: row.completedOn.toISOString().slice(0, 10),
    timeZone: row.timeZone,
    recallDays: row.recallDays,
    locale: row.locale,
    goal: row.goal,
    sleepDuration: row.sleepDuration,
    workImpact: row.workImpact,
    symptomsAnswered: row.symptomsAnswered,
    symptoms: row.symptoms.map((s) => ({
      category: s.category,
      severity: s.severity,
      frequency: s.frequency,
    })),
    healthConsentVersion: row.healthConsentVersion,
    healthConsentAt: row.healthConsentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function daysBetween(earlier: string, later: string): number {
  return (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
}

export const baselineService = {
  async get(userId: string): Promise<BaselineCheckInDto | null> {
    const row = await baselineRepository.findForUser(userId);
    return row ? toBaselineCheckInDto(row) : null;
  },

  async save(
    userId: string,
    input: SaveBaselineCheckInInput,
  ): Promise<SaveBaselineCheckInResultDto> {
    const today = localDate(new Date(), input.timeZone);
    const age = daysBetween(input.completedOn, today);
    if (age < 0 || age > MAX_AGE_DAYS) {
      throw AppError.validation("The check in date must be within the last week", [
        { field: "completedOn", message: `Must be between ${MAX_AGE_DAYS} days ago and today` },
      ]);
    }

    // requireCurrentConsent() already passed; the baseline keeps which
    // health consent covered it. Re-read so a withdrawal between the
    // two is still honoured.
    const latest = await consentRepository.latestPerType([userId]);
    const health = latest.find((r) => r.type === "HEALTH_PROCESSING");
    if (!health || health.action !== "GRANTED") throw AppError.consentRequired();

    const { baseline, created } = await baselineRepository.createOnce(userId, input, {
      version: health.version,
      grantedAt: health.createdAt,
    });
    return { baseline: toBaselineCheckInDto(baseline), created };
  },
};
