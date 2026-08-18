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

// Thin wrapper preserving this file's existing internal name/call
// sites — the canonical computation now lives in
// lib/symptom-frequency.ts (shared with export/pdf.ts's own
// symptomFrequency(), which reads only {category, count} off the same
// richer shape and ignores severityBreakdown).
function computeSymptomSummary(logs: SymptomLog[]) {
  return computeSymptomFrequency(logs);
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
    const [symptomLogs, cycleEntries, treatments] = await Promise.all([
      exportRepository.listSymptomLogsForExport(userId, query),
      exportRepository.listCycleEntriesForExport(userId, query),
      treatmentRepository.listOverlappingRange(userId, fromDate, toDate),
    ]);

    const symptomSummary = computeSymptomSummary(symptomLogs);
    const cycleSummary = computeCycleSummary(cycleEntries);
    // Computed here, fetched once, at generation time only — never
    // re-derived on a later read (see get() below), which is what
    // makes a previously generated BRIEF immune to later edits or
    // deletions of the underlying Treatment records. See
    // treatment-summary.ts's doc comment for the full reasoning,
    // including why notes are excluded.
    const treatmentSummary = computeTreatmentSummary(treatments);

    // aiInput intentionally has exactly four fields. treatmentSummary
    // is never added here, on this object, or anywhere in the
    // briefAi.generate() call below — that is the entire safety
    // boundary this feature depends on. See
    // brief.service.treatment-boundary.test.ts for the test that
    // verifies this directly against the actual serialized request.
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
      // PRISMA-SCHEMA-BOUNDARY: treatmentSummary is deliberately NOT
      // passed here. ClinicalBrief has no treatmentSummary column yet
      // (see treatment-summary.ts's doc comment for the exact field
      // the eventual migration needs to add) — briefRepository.create()
      // is intentionally left untouched rather than widening its
      // parameter type to accept a field Prisma's generated
      // ClinicalBriefCreateInput doesn't recognize, which would either
      // silently drop the value or throw at runtime against a real
      // database. The freshly computed treatmentSummary above is real,
      // current, correct data — it just has nowhere to be persisted
      // yet, so it's attached directly to this response instead
      // (below), not lost, just not yet durable across a later get().
    });

    return { ...toClinicalBriefDto(brief), treatmentSummary };
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
    if (!brief) throw AppError.notFound("Brief");
    // Deliberately no treatment query here. toClinicalBriefDto()
    // returns treatmentSummary: [] until the PRISMA-SCHEMA-BOUNDARY
    // (see treatment-summary.ts) is resolved — the tempting shortcut
    // would be to call treatmentRepository.listOverlappingRange() right
    // here as a stand-in, but that's exactly the live-query workaround
    // this design was explicitly built to avoid: it would make a
    // previously generated BRIEF's treatment section silently change
    // whenever the underlying Treatment records are later edited or
    // deleted, breaking the same reproducibility invariant
    // brief.pdf.ts already documents for every other field.
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
