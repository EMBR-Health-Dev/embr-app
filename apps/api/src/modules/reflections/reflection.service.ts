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

/** ISO 8601 week identifier (e.g. "2026-W25"), Monday-based.
 *
 * Dismissal keys are namespaced by this, not by toIsoDate(to) — a
 * previous version used the raw calendar date, which meant a
 * dismissal only survived until midnight UTC: since `to` defaults to
 * "right now" on every request and the window is a 7-day rolling
 * window recomputed fresh each call, every single day is technically
 * a "new period" under date-based keying. A user who dismissed
 * "you've logged 3 times this week" would see the near-identical
 * reflection reappear with a brand-new key the very next morning,
 * which defeats the entire purpose of persisting dismissal state.
 * Keying by ISO week instead means a dismissal lasts the whole week —
 * matching what "your week" actually means to the person reading it —
 * and a genuinely new instance only appears once the week rolls over. */
function toIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weeks start Monday; getUTCDay() is 0 (Sun) - 6 (Sat), so shift
  // Sunday to 7 before computing distance from the week's Thursday.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function resolvePeriod(query: ReflectionsQuery): { from: Date; to: Date } {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Every key is namespaced with the period's ISO week, so the exact
 * same pattern (e.g. the same co-occurring pair) surfaces again — and
 * can be dismissed again — once the week rolls over, rather than
 * either being permanently suppressed the first time it's seen or
 * (the bug this replaced) reappearing on its own the very next day. */
function buildKey(periodKey: string, ...parts: string[]): string {
  return [periodKey, ...parts].join(":");
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
    const periodKey = toIsoWeek(to);

    const [logs, treatments] = await Promise.all([
      reflectionRepository.symptomLogsForPeriod(userId, from, to),
      reflectionRepository.treatmentsOverlappingPeriod(userId, from, to),
    ]);

    const results: ReflectionDto[] = [];

    const activity = computeLoggingActivity(logs);
    if (activity) {
      const candidate = {
        type: "LOGGING_ACTIVITY" as const,
        key: buildKey(periodKey, "LOGGING_ACTIVITY"),
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
        key: buildKey(periodKey, "SYMPTOM_FREQUENCY", frequency.category),
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
          periodKey,
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
          key: buildKey(periodKey, "TREATMENT_CONTEXT", treatment.id),
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
