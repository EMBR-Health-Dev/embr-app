import type { SymptomCategory, TreatmentCategory } from "@embr/types";
import { computeSymptomFrequency } from "../../lib/symptom-frequency.js";

/** Below this, "you logged something" isn't yet a pattern worth
 * acknowledging — same role as trends' MIN_CO_OCCURRENCE_DAYS, chosen
 * as a floor rather than a target, and deliberately the same number:
 * the founder walkthrough's own "after 3 logs" acknowledgement. */
export const MIN_REFLECTION_LOGS = 3;

export interface LoggingActivityFacts {
  logCount: number;
  daysLogged: number;
}

/**
 * Stage 3 pattern detection for the Reflection MVP (see the
 * embr-clinical-logic skill doctrine — same doctrine trends'
 * co-occurrence.ts follows). Every function in this file knows nothing
 * about what its result *means* or how it should be phrased; that's
 * Stage 4/5, and deliberately does not happen here. Given the same
 * input, always returns the same output regardless of row order.
 */
export function computeLoggingActivity(
  logs: Array<{ occurredAt: Date }>,
): LoggingActivityFacts | null {
  if (logs.length < MIN_REFLECTION_LOGS) return null;

  const days = new Set(logs.map((log) => log.occurredAt.toISOString().slice(0, 10)));

  return { logCount: logs.length, daysLogged: days.size };
}

export interface SymptomFrequencyFacts {
  category: SymptomCategory;
  count: number;
}

/** Reuses computeSymptomFrequency (already the shared aggregation
 * export/pdf.ts and brief.service.ts both build on) rather than a
 * third reimplementation of "count logs per category" — this function
 * only adds the reflection-specific qualification threshold and picks
 * the top entry. */
export function computeTopSymptomFrequency(
  logs: Array<{ category: string; severity: string }>,
): SymptomFrequencyFacts | null {
  const [top] = computeSymptomFrequency(logs);
  if (!top || top.count < MIN_REFLECTION_LOGS) return null;
  return { category: top.category as SymptomCategory, count: top.count };
}

export interface TreatmentContextFacts {
  treatmentId: string;
  treatmentName: string;
  treatmentCategory: TreatmentCategory;
  logCount: number;
}

/**
 * Deliberately produces a count, and nothing that could be read as an
 * outcome. "6 symptom entries during this period" is a fact about the
 * record; "your HRT is improving your symptoms" is a causal claim this
 * function must never support — see Treatment's own schema comment for
 * why EMBR has no separate "outcome" model to tempt that framing in
 * the first place. Callers must not derive an efficacy sentence from
 * `logCount` — pass it through as-is.
 */
export function computeTreatmentContext(
  treatment: { id: string; name: string; category: TreatmentCategory },
  logsDuringTreatment: unknown[],
): TreatmentContextFacts | null {
  if (logsDuringTreatment.length === 0) return null;
  return {
    treatmentId: treatment.id,
    treatmentName: treatment.name,
    treatmentCategory: treatment.category,
    logCount: logsDuringTreatment.length,
  };
}
