import { AppError } from "@embr/shared";
import type {
  BriefTrendsDto,
  ClinicalBriefDto,
  ClinicalBriefListItemDto,
  PaginatedResponse,
  SymptomCategory,
} from "@embr/types";
import type { PaginationQuery } from "@embr/validation";
import type {
  CycleEntry,
  SymptomLog,
  Treatment,
  ClinicalBrief,
} from "../../generated/prisma/index.js";
import { DEFAULT_LOCALE, type Locale } from "../../lib/locale.js";
import { paginate } from "../../lib/pagination.js";
import { acquireLock } from "../../lib/redis-lock.js";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";
import { logger } from "../../lib/logger.js";
import { exportRepository } from "../export/export.repository.js";
import { cycleLengths } from "../export/pdf.js";
import { treatmentRepository } from "../treatments/treatment.repository.js";
import {
  buildTreatmentImpact,
  computeTreatmentImpactWindows,
} from "../treatments/treatment-impact.js";
import { detectSymptomCoOccurrence } from "../trends/co-occurrence.js";
import {
  aggregateBriefTrends,
  DEFAULT_TREND_BRIEF_LIMIT,
  type BriefTrendSourceBrief,
} from "./brief-trends.js";
import { buildLongitudinalInterpretation } from "./longitudinal-interpretation.js";
import { briefRepository } from "./brief.repository.js";
import { briefAi, type BriefInput } from "./brief.ai.js";
import { toClinicalBriefDto, toClinicalBriefListItemDto } from "./brief.mappers.js";
import {
  compareSymptomFrequency,
  computePreviousPeriod,
  groupLogDatesByCategory,
} from "./period-comparison.js";
import { detectPersistentSymptoms } from "./persistent-symptoms.js";
import { buildAiSafeStage4Interpretation } from "./stage4-ai-projection.js";
import { buildStage4Interpretation } from "./stage4-interpretation.js";
import { validateStage4Patterns } from "./stage4-validation.js";
import { computeTreatmentSummary } from "./treatment-summary.js";

// Bounds how long one generation can hold the lock below. brief.ai.ts's
// own Anthropic client caps a generation attempt at 30s with 1 retry —
// a genuine worst case of ~60s of AI time alone — so this needs real
// margin above that, not just above the happy path, or the lock could
// expire and let a second request in while the first is still
// legitimately working (the exact race this exists to prevent).
const BRIEF_GENERATION_LOCK_TTL_MS = 90_000;

/** Bumped only when ClinicalBrief.generationMetadata's own shape
 * changes (a field added, removed, or renamed) — independent of
 * interpretationVersion (stage4-interpretation.ts, tracks the Stage 4
 * pattern-building logic) and PROMPT_VERSION (brief.ai.ts, tracks the
 * system prompt), which already version their own separate concerns.
 * Internal-only, same as the metadata object itself — see that
 * field's own doc comment in schema.prisma. */
export const BRIEF_GENERATION_METADATA_SCHEMA_VERSION = "1.0";

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

/**
 * The actual generation work — everything from reading source data
 * through the paid AI call to persistence. Split out from
 * briefService.generate purely so that method can wrap this in a
 * try/finally around the Redis lock without reindenting this entire
 * body; not a second entry point, and not exported.
 */
async function generateBriefContent(
  userId: string,
  fromDate: Date,
  toDate: Date,
  locale: Locale,
): Promise<ClinicalBriefDto> {
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
  // Same already-fetched symptomLogs/previousSymptomLogs as above — no
  // new query, just the per-log dates that were always there,
  // attached onto each comparison entry (see groupLogDatesByCategory's
  // own doc comment).
  const currentDatesByCategory = groupLogDatesByCategory(symptomLogs);
  const previousDatesByCategory = groupLogDatesByCategory(previousSymptomLogs);
  const frequencyComparison = compareSymptomFrequency(symptomSummary, previousSymptomSummary).map(
    (entry) => ({
      ...entry,
      currentDates: currentDatesByCategory.get(entry.category) ?? [],
      previousDates: previousDatesByCategory.get(entry.category) ?? [],
    }),
  );

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
      // listSymptomLogsInWindows, not countSymptomLogsInWindows — the
      // evidence drill-down needs the actual dates/categories behind
      // each window's count, not just the number (see
      // treatment.repository.ts's own doc comment on why this is a
      // separate method rather than a change to the count-only one).
      const { beforeLogs, afterLogs } = await treatmentRepository.listSymptomLogsInWindows(
        userId,
        windows,
      );
      // Sorted here rather than relying solely on the query's own
      // orderBy — this is what the DTO's own doc comment promises
      // ("sorted ascending by date"), so it holds regardless of
      // whatever order the database (or, in tests, the in-memory
      // fixture) happens to return rows in.
      const byOccurredAt = (a: { occurredAt: Date }, b: { occurredAt: Date }) =>
        a.occurredAt.getTime() - b.occurredAt.getTime();
      beforeLogs.sort(byOccurredAt);
      afterLogs.sort(byOccurredAt);
      const impact = buildTreatmentImpact({
        treatmentId: treatment.id,
        startDate: treatment.startDate,
        endDate: treatment.endDate,
        today,
        beforeLogCount: beforeLogs.length,
        afterLogCount: afterLogs.length,
      });
      return {
        ...impact,
        name: treatment.name,
        category: treatment.category,
        beforeDates: beforeLogs.map((log) => ({
          date: log.occurredAt.toISOString().slice(0, 10),
          category: log.category as SymptomCategory,
        })),
        afterDates: afterLogs.map((log) => ({
          date: log.occurredAt.toISOString().slice(0, 10),
          category: log.category as SymptomCategory,
        })),
      };
    }),
  );

  // The canonical Stage 4 result — retained server-side for
  // persistence (next step) and as the source of truth for
  // provenance validation below. Never sent to the AI directly; see
  // aiInput's own comment for the AI-safe projection built from it.
  const interpretation = buildStage4Interpretation(
    {
      frequencyComparison,
      coOccurrence,
      treatmentImpact,
    },
    locale,
  );

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
    interpretation: buildAiSafeStage4Interpretation(interpretation, treatmentImpact, locale),
  };

  const { narrative, discussionTopics, patterns, modelId, promptVersion } = await briefAi.generate(
    aiInput,
    locale,
  );

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
  const validation = validateStage4Patterns(interpretation.patterns, patterns);
  if (validation.error !== null) {
    throw AppError.internal(`Brief generation failed: ${validation.error}`);
  }
  // The *canonical* patterns stage4-validation.ts just resolved each
  // returned id against — not `patterns` (the AI's own response
  // objects) directly. Only their ids are actually used below, which
  // were already proven to match a real supplied pattern either way,
  // but citedPatterns is what a future caller reads if this
  // ever needs anything beyond the id.
  const citedPatterns = validation.patterns;

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
    // citedPatterns, not the AI's raw `patterns` — see above. This
    // is specifically what the model chose to cite for *this*
    // narrative, which is a strict subset (see
    // validateStage4Patterns's own doc comment on why a subset is
    // expected and valid), not "every pattern that happened to
    // qualify."
    citedPatternIds: citedPatterns.map((pattern) => pattern.id),
    aiNarrative: narrative,
    aiDiscussionTopics: discussionTopics,
    locale,
    // Internal-only reproducibility metadata — see
    // ClinicalBrief.generationMetadata's own doc comment. Built here
    // (not inside briefAi.generate) because patternEngineVersion comes
    // from `interpretation`, which this function computed earlier and
    // briefAi.generate never sees in canonical form (only the
    // AI-safe projection — see aiInput's own comment above).
    generationMetadata: {
      schemaVersion: BRIEF_GENERATION_METADATA_SCHEMA_VERSION,
      patternEngineVersion: interpretation.interpretationVersion,
      promptVersion,
      modelId,
      generatedAt: new Date().toISOString(),
    },
  });

  return {
    ...toClinicalBriefDto(brief),
    treatmentSummary,
  };
}

export const briefService = {
  async generate(
    userId: string,
    fromDate: Date,
    toDate: Date,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<ClinicalBriefDto> {
    if (fromDate >= toDate) {
      throw AppError.validation("fromDate must be before toDate");
    }

    // Generation performs a paid AI call before anything is persisted
    // (see generateBriefContent) — this lock exists specifically to
    // stop two concurrent requests for the same (userId, fromDate,
    // toDate) from both reaching that call, not just to stop duplicate
    // rows (brief.repository.ts's unique-constraint handling is the
    // second, data-layer line of defense for that). Acquired before
    // any work starts and released in the `finally` below so a
    // legitimate retry after a real failure is never blocked by a
    // lock this same request no longer needs.
    const lockKey = `lock:brief-generate:${userId}:${fromDate.toISOString()}:${toDate.toISOString()}`;
    const lock = await acquireLock(lockKey, BRIEF_GENERATION_LOCK_TTL_MS);

    if (lock.status === "held") {
      // A real concurrent holder exists right now (Redis is reachable
      // and says so) — deterministic conflict rather than a second
      // silent generation. Not an existing-brief lookup: at this
      // instant the other request may well not have persisted
      // anything yet, so there is nothing reliable to return instead.
      throw AppError.conflict(
        "A brief for this date range is already being generated — please wait a moment and check your brief history.",
      );
    }
    if (lock.status === "unavailable") {
      // Redis itself is unreachable — distinct from "held" above.
      // Blocking every generation on a Redis outage would take down
      // this feature entirely for a rare edge case; proceeding without
      // coordination instead relies on the DB unique constraint as a
      // second line of defense (a wasted duplicate AI call is possible
      // in this specific window, but no duplicate row and no silent
      // failure).
      logger.warn({ userId }, "brief generation proceeding without a lock — Redis unavailable");
    }

    try {
      return await generateBriefContent(userId, fromDate, toDate, locale);
    } finally {
      if (lock.status === "acquired") {
        await lock.release();
      }
    }
  },

  async list(
    userId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<ClinicalBriefListItemDto>> {
    const [briefs, total] = await briefRepository.listForUser(userId, query);

    return paginate(briefs.map(toClinicalBriefListItemDto), total, query);
  },

  /** Cross-brief evidence aggregation over the user's own N most
   * recent briefs — not a new detector, not AI-involved. Reuses
   * listForUser exactly as the existing paginated history list does
   * (page 1, a small pageSize), rather than a new repository method,
   * since a plain findMany ordered by createdAt desc with a take is
   * already exactly "the N most recent briefs." See
   * brief-trends.ts's own doc comment for the aggregation semantics
   * themselves. */
  async trends(userId: string): Promise<BriefTrendsDto> {
    const [briefs] = await briefRepository.listForUser(userId, {
      page: 1,
      pageSize: DEFAULT_TREND_BRIEF_LIMIT,
    });

    const sourceBriefs: BriefTrendSourceBrief[] = briefs.map((brief: ClinicalBrief) => ({
      fromDate: brief.fromDate.toISOString().slice(0, 10),
      toDate: brief.toDate.toISOString().slice(0, 10),
      symptomSummary: brief.symptomSummary as unknown as BriefTrendSourceBrief["symptomSummary"],
      persistentSymptoms: brief.persistentSymptoms as unknown as SymptomCategory[] | null,
    }));

    const summary = aggregateBriefTrends(sourceBriefs, DEFAULT_TREND_BRIEF_LIMIT);
    // Composed here, not inside aggregateBriefTrends itself — same
    // reasoning as why buildStage4Interpretation is a separate call
    // from the evidence functions that feed it, not folded into any
    // one of them: aggregateBriefTrends stays a narrowly-scoped, pure
    // aggregation with its own already-thorough test coverage,
    // untouched by this addition.
    const longitudinalPatterns = buildLongitudinalInterpretation(summary);

    return { ...summary, longitudinalPatterns };
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
