/**
 * Turns a fictional EvalRecord into exactly what production gives the
 * model, using production's own deterministic functions: symptom
 * summary, period comparison, co-occurrence, treatment window, Stage 4
 * interpretation and the AI-safe projection. No second implementation.
 */
import type { BriefTreatmentImpactEntryDto, SymptomCategory } from "@embr/types";
import { computeSymptomFrequency } from "../../src/lib/symptom-frequency.js";
import { compareSymptomFrequency } from "../../src/modules/briefs/period-comparison.js";
import { detectSymptomCoOccurrence } from "../../src/modules/trends/co-occurrence.js";
import { buildTreatmentImpact } from "../../src/modules/treatments/treatment-impact.js";
import {
  buildStage4Interpretation,
  type Stage4Result,
} from "../../src/modules/briefs/stage4-interpretation.js";
import { buildAiSafeStage4Interpretation } from "../../src/modules/briefs/stage4-ai-projection.js";
import type { BriefInput } from "../../src/modules/briefs/brief.ai.js";
import type { EvalEntry, EvalRecord } from "./records.js";

const noon = (date: string) => new Date(`${date}T12:00:00Z`);

export interface PreparedRecord {
  record: EvalRecord;
  /** What the model is sent (AI-safe projection, no treatment names). */
  aiInput: BriefInput;
  /** The canonical interpretation citations are checked against. */
  interpretation: Stage4Result;
}

export function prepareRecord(record: EvalRecord): PreparedRecord {
  const asLogs = (entries: EvalEntry[]) =>
    entries.map((e) => ({
      category: e.category as SymptomCategory,
      severity: e.severity,
      occurredAt: noon(e.date),
    }));
  const current = asLogs(record.current);
  const previous = asLogs(record.previous);

  const symptomSummary = computeSymptomFrequency(current);
  const frequencyComparison = compareSymptomFrequency(
    symptomSummary,
    computeSymptomFrequency(previous),
  );
  const coOccurrence = detectSymptomCoOccurrence(current, "UTC");

  const treatmentImpact: BriefTreatmentImpactEntryDto[] = record.treatment
    ? [
        {
          ...buildTreatmentImpact({
            treatmentId: record.treatment.id,
            startDate: noon(record.treatment.startDate),
            endDate: null,
            today: noon(record.toDate),
            beforeLogCount: record.treatment.beforeLogCount,
            afterLogCount: record.treatment.afterLogCount,
          }),
          // Fictional, and never part of the AI input (the projection
          // below strips treatment names).
          name: "Fictional treatment",
          category: "HRT",
          beforeDates: [],
          afterDates: [],
        },
      ]
    : [];

  const interpretation = buildStage4Interpretation(
    { frequencyComparison, coOccurrence, treatmentImpact },
    record.locale,
  );

  return {
    record,
    interpretation,
    aiInput: {
      fromDate: record.fromDate,
      toDate: record.toDate,
      symptomSummary,
      cycleSummary: record.cycle,
      interpretation: buildAiSafeStage4Interpretation(
        interpretation,
        treatmentImpact,
        record.locale,
      ),
    },
  };
}
