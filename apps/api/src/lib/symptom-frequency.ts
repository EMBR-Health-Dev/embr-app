import { severityLevelSchema } from "@embr/validation";

export interface SymptomFrequencyEntry {
  category: string;
  count: number;
  severityBreakdown: Record<string, number>;
}

// The canonical MILD → MODERATE → SEVERE order, not a new ordering
// invented for this file — severityLevelSchema.options is the same
// array apps/mobile/app/(app)/index.tsx already uses as its own
// severity ordering source.
const SEVERITY_ORDER = severityLevelSchema.options;

/** Aggregates raw symptom logs into per-category frequency, with a
 * severity breakdown. Presentation-independent: consumers that only
 * need {category, count} (e.g. export/pdf.ts) simply don't read
 * severityBreakdown — an unused field on an object is inert, not a
 * behavior change for them.
 *
 * Iterates logs in array order and relies on JavaScript's Map
 * insertion order plus a stable sort (guaranteed since ES2019) so that
 * categories with equal counts retain their first-appearance order —
 * this matches both of the two implementations this replaces exactly,
 * neither of which sorted or deduplicated logs before aggregating.
 * That first-appearance-order reasoning applies to category order
 * only, not to each category's severityBreakdown: severity keys are
 * re-keyed into SEVERITY_ORDER below (excluding severities absent for
 * that category) before being returned, rather than left in whatever
 * order they first appeared in the log stream — a person reading
 * "Moderate: 2, Mild: 1, Severe: 3" has no reason to expect that
 * specific order to mean anything, whereas Mild → Moderate → Severe
 * is a scale every consumer of this data should be able to rely on
 * without re-sorting it themselves. */
export function computeSymptomFrequency(
  logs: Array<{ category: string; severity: string }>,
): SymptomFrequencyEntry[] {
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
    .map(([category, { count, severityBreakdown }]) => {
      const ordered: Record<string, number> = {};
      for (const severity of SEVERITY_ORDER) {
        if (severityBreakdown[severity] !== undefined) {
          ordered[severity] = severityBreakdown[severity];
        }
      }
      return { category, count, severityBreakdown: ordered };
    })
    .sort((a, b) => b.count - a.count);
}
