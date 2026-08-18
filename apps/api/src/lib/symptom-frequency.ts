export interface SymptomFrequencyEntry {
  category: string;
  count: number;
  severityBreakdown: Record<string, number>;
}

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
 * neither of which sorted or deduplicated logs before aggregating. */
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
    .map(([category, { count, severityBreakdown }]) => ({ category, count, severityBreakdown }))
    .sort((a, b) => b.count - a.count);
}
