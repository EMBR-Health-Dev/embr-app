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
import { detectPersistentSymptoms } from "./persistent-symptoms.js";
import { buildAiSafeStage4Interpretation } from "./stage4-ai-projection.js";
import { buildStage4Interpretation } from "./stage4-interpretation.js";
import { validateStage4Patterns } from "./stage4-validation.js";
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

    // Zero new data: a pure filter over frequencyComparison, which is
    // already computed above — no new counting, no new query. See
    // persistent-symptoms.ts for the exact rule.
    const persistentSymptoms = detectPersistentSymptoms(frequencyComparison);

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

    // The canonical Stage 4 result — retained server-side for
    // persistence (next step) and as the source of truth for
    // provenance validation below. Never sent to the AI directly; see
    // aiInput's own comment for the AI-safe projection built from it.
    const interpretation = buildStage4Interpretation({
      frequencyComparison,
      coOccurrence,
      treatmentImpact,
    });

    const aiInput: BriefInput = {
      fromDate: fromDate.toISOString().slice(0, 10),
      toDate: toDate.toISOString().slice(0, 10),
      symptomSummary,
      cycleSummary,
      // The deterministic Stage 4 layer, built from the same three
      // evidence pieces already computed above — not a fourth
      // computation, just composed into the shape brief.ai.ts expects.
      // See stage4-interpretation.ts's own doc comment for why this is
      // the only thing that can ever tell the AI two facts are
      // related: it never sees frequencyComparison, coOccurrence, or
      // treatmentImpact directly, only whatever patterns this step
      // already decided qualify.
      //
      // NOT the canonical `interpretation` below — the AI-safe
      // projection specifically, with treatment names stripped. See
      // stage4-ai-projection.ts's own doc comment for why: the
      // canonical Stage4Pattern for treatment_window_changed embeds
      // the treatment's name in its observation text (a reasonable
      // choice for UI/PDF rendering), but that was never an approved
      // exception to the existing "treatment data and free-text notes
      // are not sent to the AI" invariant.
      interpretation: buildAiSafeStage4Interpretation(interpretation, treatmentImpact),
    };

    const { narrative, discussionTopics, patterns } = await briefAi.generate(aiInput);

    // Citation integrity: every pattern the AI echoed back must
    // resolve to one this step actually supplied, unaltered. Validated
    // against the *canonical* interpretation, not the AI-safe
    // projection sent above — they're expected to agree exactly for
    // id/type/evidenceRef (only observation text differs for treatment
    // patterns, and stage4-validation.ts deliberately never compares
    // that field — see its own doc comment), so this remains a
    // faithful check of what the model actually received. Fails
    // closed — brief.service.ts awaits this before ever persisting
    // anything, so a provenance failure means no ClinicalBrief is
    // created at all, matching the AI's own content-safety failure
    // path immediately below.
    const provenanceFailure = validateStage4Patterns(interpretation.patterns, patterns);
    if (provenanceFailure) {
      throw AppError.internal(`Brief generation failed: ${provenanceFailure}`);
    }

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
      persistentSymptoms: JSON.parse(JSON.stringify(persistentSymptoms)),
      // The exact same canonical object computed once above — used to
      // build the AI-safe projection and to validate the AI's
      // response — persisted here unchanged, never recomputed. This
      // is the one canonical Stage4Result for this generation; there
      // is no second call to buildStage4Interpretation anywhere in
      // this flow.
      interpretation: JSON.parse(JSON.stringify(interpretation)),
      // The AI's own validated response, not re-derived from
      // `interpretation` — this is specifically what the model chose
      // to cite for *this* narrative, which is a strict subset (see
      // validateStage4Patterns's own doc comment on why a subset is
      // expected and valid), not "every pattern that happened to
      // qualify."
      citedPatternIds: patterns.map((pattern) => pattern.id),
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
