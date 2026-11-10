import type { ContextFactor, NextDayContextDto, SymptomCategory } from "@embr/types";
import { MIN_CO_OCCURRENCE_DAYS } from "./co-occurrence.js";
import { factorAnswered, qualifyingFactors, type ContextLogRow } from "./context-co-occurrence.js";
import { addDaysToIsoDate, localDate } from "./symptom-history.js";

/**
 * Stage 3 of EMBR's clinical logic pipeline (see the embr-clinical-logic
 * skill doctrine): what she recorded on the day after a context factor,
 * next to what she recorded on the day after days without it. Counts
 * only. It never says a factor causes, triggers or worsens a symptom,
 * and the copy that renders it must not either.
 *
 * Fixed, versioned rules:
 * - A factor counts on a day by exactly the rule in
 *   context-co-occurrence.ts (qualifyingFactors), so the two features
 *   can never disagree about what "short sleep" means.
 * - A day "without" the factor is a day she answered that question with
 *   a different answer. Unanswered questions are left out.
 * - The day after only counts if she recorded something on it (a
 *   symptom or a context answer). An empty day after says nothing about
 *   whether a symptom was there.
 * - A pair is shown only when the symptom followed the factor on at
 *   least MIN_CO_OCCURRENCE_DAYS days (the same minimum as the existing
 *   co-occurrence cards), there are at least that many comparison days,
 *   and the share after the factor is higher than the share after
 *   other days.
 * - At most MAX_RESULTS pairs, most days first, then the larger gap in
 *   share, then alphabetical.
 *
 * Given the same entries and time zone, always returns the same output,
 * whatever order the rows come in.
 */
export const MAX_RESULTS = 3;
export const NEXT_DAY_RULE_VERSION = "1.0";

const FACTORS: ContextFactor[] = [
  "ALCOHOL",
  "CAFFEINE_AFTERNOON",
  "HIGH_STRESS",
  "SHORT_SLEEP",
  "VIGOROUS_EXERCISE",
];

export function detectNextDayContext(
  symptomLogs: Array<{ category: SymptomCategory; occurredAt: Date }>,
  contextLogs: ContextLogRow[],
  timeZone = "UTC",
): NextDayContextDto[] {
  const datesByCategory = new Map<SymptomCategory, Set<string>>();
  const activeDates = new Set<string>();
  for (const log of symptomLogs) {
    const date = localDate(log.occurredAt, timeZone);
    activeDates.add(date);
    let dates = datesByCategory.get(log.category);
    if (!dates) {
      dates = new Set();
      datesByCategory.set(log.category, dates);
    }
    dates.add(date);
  }
  for (const log of contextLogs) activeDates.add(log.date.toISOString().slice(0, 10));

  const results: NextDayContextDto[] = [];
  for (const factor of FACTORS) {
    const withFactor: string[] = [];
    const withoutFactor: string[] = [];
    for (const log of contextLogs) {
      if (!factorAnswered(log, factor)) continue;
      const nextDay = addDaysToIsoDate(log.date.toISOString().slice(0, 10), 1);
      if (!activeDates.has(nextDay)) continue;
      (qualifyingFactors(log).includes(factor) ? withFactor : withoutFactor).push(nextDay);
    }
    if (withFactor.length < MIN_CO_OCCURRENCE_DAYS) continue;
    if (withoutFactor.length < MIN_CO_OCCURRENCE_DAYS) continue;

    for (const category of [...datesByCategory.keys()].sort()) {
      const dates = datesByCategory.get(category)!;
      const afterFactorDays = withFactor.filter((d) => dates.has(d)).length;
      const otherDays = withoutFactor.filter((d) => dates.has(d)).length;
      if (afterFactorDays < MIN_CO_OCCURRENCE_DAYS) continue;
      // Compare shares without division: a/b > c/d  <=>  a*d > c*b.
      if (afterFactorDays * withoutFactor.length <= otherDays * withFactor.length) continue;
      results.push({
        factor,
        category,
        afterFactorDays,
        afterFactorTotal: withFactor.length,
        otherDays,
        otherTotal: withoutFactor.length,
      });
    }
  }

  const gap = (r: NextDayContextDto) =>
    r.afterFactorDays / r.afterFactorTotal - r.otherDays / r.otherTotal;
  results.sort(
    (a, b) =>
      b.afterFactorDays - a.afterFactorDays ||
      gap(b) - gap(a) ||
      a.category.localeCompare(b.category) ||
      a.factor.localeCompare(b.factor),
  );
  return results.slice(0, MAX_RESULTS);
}
