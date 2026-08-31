import type { ReflectionsQuery } from "@embr/validation";
import type { ReflectionDto, ReflectionType, SymptomCategory } from "@embr/types";
import { detectSymptomCoOccurrence } from "../trends/co-occurrence.js";
import {
  computeLoggingActivity,
  computeTopSymptomFrequency,
  computeTreatmentContext,
} from "./reflection-engine.js";
import { reflectionRepository } from "./reflection.repository.js";

/** No explicit range means "the trailing week" — the default the
 * founder walkthrough's "after 7 days" reflection assumes, and the
 * window the home screen calls this endpoint with. Kept here, in the
 * one place the computation happens, rather than defaulted in the
 * query schema (see reflectionsQuerySchema's doc comment). */
const DEFAULT_WINDOW_DAYS = 7;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolvePeriod(query: ReflectionsQuery): { from: Date; to: Date } {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Every key is namespaced with the period's end date, so the exact
 * same pattern (e.g. the same co-occurring pair) surfaces again — and
 * can be dismissed again — once real time has moved to a new period,
 * rather than being permanently suppressed the first time it's seen. */
function buildKey(periodEnd: string, ...parts: string[]): string {
  return [periodEnd, ...parts].join(":");
}

async function filterDismissed<T extends { key: string }>(
  userId: string,
  type: ReflectionType,
  candidates: T[],
): Promise<T[]> {
  if (candidates.length === 0) return candidates;
  const dismissed = new Set(
    await reflectionRepository.dismissedKeys(
      userId,
      type,
      candidates.map((c) => c.key),
    ),
  );
  return candidates.filter((c) => !dismissed.has(c.key));
}

export const reflectionService = {
  /**
   * Returns every qualifying, not-yet-dismissed reflection for the
   * period, in the same order the home screen's mock renders them:
   * "your week" (logging activity, then top symptom), then something
   * worth noticing (co-occurrence), then treatment context. The client
   * decides how many of these to actually show — this endpoint doesn't
   * pick a single "best" one, the same way /trends doesn't.
   */
  async list(userId: string, query: ReflectionsQuery): Promise<ReflectionDto[]> {
    const { from, to } = resolvePeriod(query);
    const periodStart = toIsoDate(from);
    const periodEnd = toIsoDate(to);

    const [logs, treatments] = await Promise.all([
      reflectionRepository.symptomLogsForPeriod(userId, from, to),
      reflectionRepository.treatmentsOverlappingPeriod(userId, from, to),
    ]);

    const results: ReflectionDto[] = [];

    const activity = computeLoggingActivity(logs);
    if (activity) {
      const candidate = {
        type: "LOGGING_ACTIVITY" as const,
        key: buildKey(periodEnd, "LOGGING_ACTIVITY"),
        periodStart,
        periodEnd,
        ...activity,
      };
      const [kept] = await filterDismissed(userId, "LOGGING_ACTIVITY", [candidate]);
      if (kept) results.push(kept);
    }

    const frequency = computeTopSymptomFrequency(logs);
    if (frequency) {
      const candidate = {
        type: "SYMPTOM_FREQUENCY" as const,
        key: buildKey(periodEnd, "SYMPTOM_FREQUENCY", frequency.category),
        periodStart,
        periodEnd,
        ...frequency,
      };
      const [kept] = await filterDismissed(userId, "SYMPTOM_FREQUENCY", [candidate]);
      if (kept) results.push(kept);
    }

    // Same detection function trends' /trends/co-occurrence uses —
    // deliberately not reimplemented here.
    const coOccurrence = detectSymptomCoOccurrence(
      logs.map((log) => ({
        category: log.category as SymptomCategory,
        occurredAt: log.occurredAt,
      })),
    );
    if (coOccurrence) {
      const candidate = {
        type: "SYMPTOM_CO_OCCURRENCE" as const,
        key: buildKey(
          periodEnd,
          "SYMPTOM_CO_OCCURRENCE",
          coOccurrence.categoryA,
          coOccurrence.categoryB,
        ),
        periodStart,
        periodEnd,
        ...coOccurrence,
      };
      const [kept] = await filterDismissed(userId, "SYMPTOM_CO_OCCURRENCE", [candidate]);
      if (kept) results.push(kept);
    }

    const treatmentCandidates = treatments
      .map((treatment) => {
        // Treatment start/end are @db.Date (midnight, date-only); a log
        // timestamped later on the treatment's actual end date must
        // still count as "during" it, so this compares calendar-date
        // strings rather than raw Date objects — comparing the raw
        // Date instances would wrongly exclude any log after midnight
        // on the end date itself.
        const startDate = toIsoDate(treatment.startDate);
        const endDate = treatment.endDate ? toIsoDate(treatment.endDate) : null;
        const logsDuringTreatment = logs.filter((log) => {
          const logDate = toIsoDate(log.occurredAt);
          return logDate >= startDate && (endDate === null || logDate <= endDate);
        });
        const facts = computeTreatmentContext(treatment, logsDuringTreatment);
        if (!facts) return null;
        return {
          type: "TREATMENT_CONTEXT" as const,
          key: buildKey(periodEnd, "TREATMENT_CONTEXT", treatment.id),
          periodStart,
          periodEnd,
          ...facts,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const keptTreatmentContexts = await filterDismissed(
      userId,
      "TREATMENT_CONTEXT",
      treatmentCandidates,
    );
    results.push(...keptTreatmentContexts);

    return results;
  },

  async dismiss(userId: string, type: ReflectionType, key: string): Promise<void> {
    await reflectionRepository.dismiss(userId, type, key);
  },
};
