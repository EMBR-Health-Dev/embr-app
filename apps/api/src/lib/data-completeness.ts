/**
 * Stage 3 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine) — a plain, deterministic count of how many distinct
 * calendar days within a date range have at least one symptom log,
 * versus how many days the range actually spans. No AI, no
 * interpretation of what a low or high figure *means*; that's left to
 * whoever reads it (a person, or — see brief.ai.ts's Rule 4 — the
 * brief's AI narrative, which is explicitly told to say so plainly
 * when completeness is low rather than invent a pattern from sparse
 * data).
 *
 * This is a general-purpose utility, not brief- or treatment-specific
 * (hence living in lib/, alongside symptom-frequency.ts), because
 * "how much of this window is actually covered by logs" is a question
 * that applies to any deterministic summary computed over a date
 * range, not just a Clinical Brief.
 */

import type { DataCompletenessDto } from "@embr/types";

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `toDate` is treated as exclusive, matching brief.service.ts's own
 * `fromDate >= toDate` validation and its [fromDate, toDate) framing
 * elsewhere in this codebase (e.g. symptom-buckets.ts, treatment-
 * impact.ts). `totalDays` is therefore the number of calendar days
 * from fromDate up to but not including toDate.
 */
export function computeDataCompleteness(
  logs: Array<{ occurredAt: Date }>,
  fromDate: Date,
  toDate: Date,
): DataCompletenessDto {
  const totalDays = Math.max(
    1,
    Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const loggedDateKeys = new Set<string>();
  for (const log of logs) {
    loggedDateKeys.add(toUtcDateKey(log.occurredAt));
  }

  // A log just outside [fromDate, toDate) shouldn't inflate this
  // count — defensive against a caller passing logs that weren't
  // actually filtered to the range (this function doesn't do that
  // filtering itself; it trusts its input, same as
  // computeSymptomFrequency does).
  const daysLogged = [...loggedDateKeys].filter((key) => {
    const date = new Date(`${key}T00:00:00.000Z`);
    return date.getTime() >= fromDate.getTime() && date.getTime() < toDate.getTime();
  }).length;

  return {
    totalDays,
    daysLogged,
    completenessPercent: Math.round((daysLogged / totalDays) * 100),
  };
}
