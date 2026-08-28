import { AppError } from "@embr/shared";
import type {
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  PaginatedResponse,
  SymptomCategory,
} from "@embr/types";
import type { PaginationQuery } from "@embr/validation";
import type { CycleEntry, SymptomLog, Treatment } from "../../generated/prisma/index.js";
import { paginate } from "../../lib/pagination.js";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";
import { exportRepository } from "../export/export.repository.js";
import { cycleLengths } from "../export/pdf.js";
import { treatmentRepository } from "../treatments/treatment.repository.js";
import {
  buildTreatmentImpact,
  computeTreatmentImpactWindows,
} from "../treatments/treatment-impact.js";
import { detectSymptomCoOccurrence } from "../trends/co-occurrence.js";
import { briefRepository } from "./brief.repository.js";
import { briefAi, type BriefInput } from "./brief.ai.js";
import { toClinicalBriefDto, toClinicalBriefListItemDto } from "./brief.mappers.js";
import { compareSymptomFrequency, computePreviousPeriod } from "./period-comparison.js";
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
    // See period-comparison.ts's own doc comment for why this window
    // is exactly this long and starts exactly here — same fair-window
    // reasoning treatment-impact.ts already established, not a
    // second, independent definition of "comparison period."
    const previousPeriod = computePreviousPeriod(fromDate, toDate);
    const previousQuery = { from: previousPeriod.from, to: previousPeriod.to };

    const [symptomLogs, cycleEntries, treatments, previousSymptomLogs] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
      treatmentRepository.listOverlappingRange(userId, fromDate, toDate),
      exportRepository.listSymptomLogsForExport(userId, previousQuery),
    ]);

    const symptomSummary = computeSymptomSummary(symptomLogs);
    const cycleSummary = computeCycleSummary(cycleEntries);
    const treatmentSummary = computeTreatmentSummary(treatments);
    // The comparison only needs {category, count} — computeSymptomSummary's
    // richer {severityBreakdown} output is structurally compatible and
    // simply unused here, same "extra field is inert" precedent
    // symptom-frequency.ts's own doc comment already establishes; this
    // reuses the exact same aggregation this brief already computes
    // for the current period rather than a second, parallel counting
    // implementation for the previous one.
    const previousSymptomSummary = computeSymptomSummary(previousSymptomLogs);
    const frequencyComparison = compareSymptomFrequency(symptomSummary, previousSymptomSummary);

    // Against the brief's own requested period only — never the
    // previous comparison period, and never a combination of the two
    // (see period-comparison.ts's separate, independent window for
    // that). Reuses the already-fetched current-period symptomLogs
    // rather than a second query — same {category, occurredAt} cast
    // trends.service.ts's own coOccurrence() already establishes for
    // this exact function, not a new pattern invented here.
    const coOccurrence = detectSymptomCoOccurrence(
      symptomLogs.map((log: SymptomLog) => ({
        category: log.category as SymptomCategory,
        occurredAt: log.occurredAt,
      })),
    );

    // One entry per treatment that *started* inside [fromDate, toDate]
    // — not every treatment in `treatments` (which also includes ones
    // merely ongoing through the period, already covered by
    // treatmentSummary above). A treatment that started long before
    // this period would have its before/after windows computed around
    // a start date unrelated to what this brief is actually about.
    // Each window genuinely needs its own query — unlike
    // symptomLogs/coOccurrence above, the "before" window commonly
    // extends outside [fromDate, toDate] entirely (14 days before the
    // treatment's own start), so the already-fetched current-period
    // data can't be reused here the way it could for co-occurrence.
    const today = new Date(new Date().toISOString().slice(0, 10));
    const treatmentsStartedInPeriod = treatments.filter(
      (t: Treatment) => t.startDate >= fromDate && t.startDate <= toDate,
    );
    const treatmentImpact = await Promise.all(
      treatmentsStartedInPeriod.map(async (treatment: Treatment) => {
        const windows = computeTreatmentImpactWindows({
          startDate: treatment.startDate,
          endDate: treatment.endDate,
          today,
        });
        const { beforeLogCount, afterLogCount } =
          await treatmentRepository.countSymptomLogsInWindows(userId, windows);
        const impact = buildTreatmentImpact({
          treatmentId: treatment.id,
          startDate: treatment.startDate,
          endDate: treatment.endDate,
          today,
          beforeLogCount,
          afterLogCount,
        });
        return { ...impact, name: treatment.name, category: treatment.category };
      }),
    );

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
      frequencyComparison: JSON.parse(JSON.stringify(frequencyComparison)),
      coOccurrence: coOccurrence === null ? null : JSON.parse(JSON.stringify(coOccurrence)),
      treatmentImpact: JSON.parse(JSON.stringify(treatmentImpact)),
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
