import { AppError } from "@embr/shared";
import type { ClinicalBriefDto, ClinicalBriefListItemDto } from "@embr/types";
import type { CycleEntry, SymptomLog } from "../../generated/prisma/index.js";
import { exportRepository } from "../export/export.repository.js";
import { cycleLengths } from "../export/pdf.js";
import { briefRepository } from "./brief.repository.js";
import { briefAi, type BriefInput } from "./brief.ai.js";
import { toClinicalBriefDto, toClinicalBriefListItemDto } from "./brief.mappers.js";

function computeSymptomSummary(logs: SymptomLog[]) {
  const byCategory = new Map<
    string,
    { count: number; severityBreakdown: Record<string, number> }
  >();

  for (const log of logs) {
    const entry = byCategory.get(log.category) ?? { count: 0, severityBreakdown: {} };
    entry.count += 1;
    entry.severityBreakdown[log.severity] = (entry.severityBreakdown[log.severity] ?? 0) + 1;
    byCategory.set(log.category, entry);
  }

  return [...byCategory.entries()]
    .map(([category, { count, severityBreakdown }]) => ({ category, count, severityBreakdown }))
    .sort((a, b) => b.count - a.count);
}

function computeCycleSummary(entries: CycleEntry[]) {
  const lengths = cycleLengths(entries);
  const averageCycleLengthDays =
    lengths.length > 0 ? Math.round(lengths.reduce((sum, l) => sum + l, 0) / lengths.length) : null;

  return {
    averageCycleLengthDays,
    cycleCount: lengths.length,
    periodDaysLogged: entries.filter((e) => e.flow !== null).length,
  };
}

export const briefService = {
  async generate(userId: string, fromDate: Date, toDate: Date): Promise<ClinicalBriefDto> {
    if (fromDate >= toDate) {
      throw AppError.validation("fromDate must be before toDate");
    }

    const query = { from: fromDate, to: toDate };
    const [symptomLogs, cycleEntries] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
    ]);

    const symptomSummary = computeSymptomSummary(symptomLogs);
    const cycleSummary = computeCycleSummary(cycleEntries);

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
      symptomSummary,
      cycleSummary,
      aiNarrative: narrative,
      aiDiscussionTopics: discussionTopics,
    });

    return toClinicalBriefDto(brief);
  },

  async list(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: ClinicalBriefListItemDto[]; total: number; page: number; pageSize: number }> {
    const [briefs, total] = await briefRepository.listForUser(userId, page, pageSize);
    return { items: briefs.map(toClinicalBriefListItemDto), total, page, pageSize };
  },

  async get(id: string, userId: string): Promise<ClinicalBriefDto> {
    const brief = await briefRepository.findByIdForUser(id, userId);
    if (!brief) throw AppError.notFound("Brief");
    return toClinicalBriefDto(brief);
  },

  /** Returns the raw record (not the DTO) — brief.pdf.ts needs the
   * untyped Json fields in their stored shape, not the DTO's narrower
   * public type. */
  async getRaw(id: string, userId: string) {
    const brief = await briefRepository.findByIdForUser(id, userId);
    if (!brief) throw AppError.notFound("Brief");
    return brief;
  },

  async delete(id: string, userId: string): Promise<void> {
    const result = await briefRepository.deleteByIdForUser(id, userId);
    if (result.count === 0) throw AppError.notFound("Brief");
  },
};
