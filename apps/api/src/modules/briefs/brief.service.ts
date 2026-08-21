import { AppError } from "@embr/shared";
import type { ClinicalBriefDto, ClinicalBriefListItemDto, PaginatedResponse } from "@embr/types";
import type { PaginationQuery } from "@embr/validation";
import type { CycleEntry, SymptomLog } from "../../generated/prisma/index.js";
import { paginate } from "../../lib/pagination.js";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";
import { exportRepository } from "../export/export.repository.js";
import { cycleLengths } from "../export/pdf.js";
import { treatmentRepository } from "../treatments/treatment.repository.js";
import { briefRepository } from "./brief.repository.js";
import { briefAi, type BriefInput } from "./brief.ai.js";
import { toClinicalBriefDto, toClinicalBriefListItemDto } from "./brief.mappers.js";
import { computeTreatmentSummary } from "./treatment-summary.js";

function computeSymptomSummary(logs: SymptomLog[]) {
  return computeSymptomFrequency(logs);
}

function computeCycleSummary(entries: CycleEntry[]) {
  const lengths = cycleLengths(entries);

  const averageCycleLengthDays =
    lengths.length > 0
      ? Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length)
      : null;

  return {
    averageCycleLengthDays,
    cycleCount: lengths.length,
    periodDaysLogged: entries.filter((entry) => entry.flow !== null).length,
  };
}

export const briefService = {
  async generate(userId: string, fromDate: Date, toDate: Date): Promise<ClinicalBriefDto> {
    if (fromDate >= toDate) {
      throw AppError.validation("fromDate must be before toDate");
    }

    const query = {
      from: fromDate,
      to: toDate,
    };

    const [symptomLogs, cycleEntries, treatments] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
      treatmentRepository.listOverlappingRange(userId, fromDate, toDate),
    ]);

    const symptomSummary = computeSymptomSummary(symptomLogs);
    const cycleSummary = computeCycleSummary(cycleEntries);
    const treatmentSummary = computeTreatmentSummary(treatments);

    const aiInput: BriefInput = {
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
      symptomSummary,
      cycleSummary,
    };

    const { narrative, discussionTopics } = await briefAi.generate(aiInput);

    const brief = await briefRepository.create({
      userId,
      fromDate,
      toDate,
      symptomSummary: JSON.parse(JSON.stringify(symptomSummary)),
      cycleSummary: JSON.parse(JSON.stringify(cycleSummary)),
      treatmentSummary: JSON.parse(JSON.stringify(treatmentSummary)),
      aiNarrative: narrative,
      aiDiscussionTopics: discussionTopics,
    });

    return {
      ...toClinicalBriefDto(brief),
      treatmentSummary,
    };
  },

  async list(
    userId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<ClinicalBriefListItemDto>> {
    const [briefs, total] = await briefRepository.listForUser(userId, query);

    return paginate(briefs.map(toClinicalBriefListItemDto), total, query);
  },

  async get(id: string, userId: string): Promise<ClinicalBriefDto> {
    const brief = await briefRepository.findByIdForUser(id, userId);

    if (!brief) {
      throw AppError.notFound("Brief");
    }

    return toClinicalBriefDto(brief);
  },

  async getRaw(id: string, userId: string) {
    const brief = await briefRepository.findByIdForUser(id, userId);

    if (!brief) {
      throw AppError.notFound("Brief");
    }

    return brief;
  },

  async delete(id: string, userId: string): Promise<void> {
    const result = await briefRepository.deleteByIdForUser(id, userId);

    if (result.count === 0) {
      throw AppError.notFound("Brief");
    }
  },
};
