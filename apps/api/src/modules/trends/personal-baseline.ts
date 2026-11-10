import type { PersonalBaselineDto, SymptomCategory } from "@embr/types";
import { addDaysToIsoDate, localDate } from "./symptom-history.js";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine): her own usual week, compared with this week. It
 * compares her only with herself, in counts of days, and says nothing
 * about what a difference means. No population norm, no clinical
 * threshold, no "high" or "low" verdict: the copy shows two numbers
 * side by side.
 *
 * Fixed, versioned rules:
 * - "This week" is the 7 local days ending today, today included.
 * - Her usual week is the median, per symptom, of the number of days
 *   that symptom was recorded in each of the BASELINE_WEEKS 7-day blocks
 *   before this week.
 * - Only blocks in which she recorded anything at all (a symptom or a
 *   context answer) count. A week she did not open EMBR says nothing
 *   about her symptoms, and counting it as zero would pull her usual
 *   down.
 * - With fewer than MIN_BASELINE_WEEKS such blocks there is no usual
 *   week yet, and no items are returned. This is a data-sufficiency rule
 *   (a month of her own weeks before a median means anything), not a
 *   clinical one.
 *
 * Given the same entries, time zone and "now", always returns the same
 * output, whatever order the rows come in.
 */
export const BASELINE_WEEKS = 8;
export const MIN_BASELINE_WEEKS = 4;
export const BASELINE_RULE_VERSION = "1.0";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function computePersonalBaseline(input: {
  symptomLogs: Array<{ category: SymptomCategory; occurredAt: Date }>;
  /** Calendar dates (already local) on which she answered any context question. */
  contextDates: string[];
  timeZone: string;
  now: Date;
}): PersonalBaselineDto {
  const today = localDate(input.now, input.timeZone);
  const thisWeekFrom = addDaysToIsoDate(today, -6);

  const datesByCategory = new Map<SymptomCategory, Set<string>>();
  const activeDates = new Set<string>(input.contextDates);
  for (const log of input.symptomLogs) {
    const date = localDate(log.occurredAt, input.timeZone);
    activeDates.add(date);
    let dates = datesByCategory.get(log.category);
    if (!dates) {
      dates = new Set();
      datesByCategory.set(log.category, dates);
    }
    dates.add(date);
  }

  // Block k (1..BASELINE_WEEKS) covers the 7 days ending 7k days before today.
  const blocks: Array<{ from: string; to: string }> = [];
  for (let k = 1; k <= BASELINE_WEEKS; k++) {
    const to = addDaysToIsoDate(today, -7 * k);
    blocks.push({ from: addDaysToIsoDate(to, -6), to });
  }
  const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
  const activeBlocks = blocks.filter((block) =>
    [...activeDates].some((date) => inRange(date, block.from, block.to)),
  );

  const base = {
    thisWeek: { from: thisWeekFrom, to: today },
    baselineWeeks: activeBlocks.length,
    minBaselineWeeks: MIN_BASELINE_WEEKS,
    ruleVersion: BASELINE_RULE_VERSION,
  };
  if (activeBlocks.length < MIN_BASELINE_WEEKS) {
    return { ...base, enoughHistory: false, items: [] };
  }

  const items: PersonalBaselineDto["items"] = [];
  for (const category of [...datesByCategory.keys()].sort()) {
    const dates = [...datesByCategory.get(category)!];
    const count = (from: string, to: string) => dates.filter((d) => inRange(d, from, to)).length;
    const thisWeekDays = count(thisWeekFrom, today);
    const usualWeekDays = median(activeBlocks.map((block) => count(block.from, block.to)));
    if (thisWeekDays === 0 && usualWeekDays === 0) continue;
    items.push({ category, thisWeekDays, usualWeekDays });
  }

  // Largest difference first; ties keep the alphabetical order above
  // (Array.prototype.sort is stable).
  items.sort(
    (a, b) =>
      Math.abs(b.thisWeekDays - b.usualWeekDays) - Math.abs(a.thisWeekDays - a.usualWeekDays),
  );

  return { ...base, enoughHistory: true, items };
}
