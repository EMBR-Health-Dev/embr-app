import { severityLevelSchema } from "@embr/validation";
import type { SeverityLevel, SeverityTrendDto, SymptomCategory } from "@embr/types";
import { localDate } from "../trends/symptom-history.js";
import { datesBetween } from "./brief-day-grid.js";

/** Up to this many days the trend is shown week by week; beyond it, in
 * 4 week blocks, so a long BRIEF still fits one row per symptom. */
export const WEEKLY_TREND_MAX_DAYS = 91;

const SEVERITY_ORDER = severityLevelSchema.options;

/**
 * Severity over the BRIEF's period, per symptom, block by block: the
 * highest severity she recorded in each block and on how many days.
 * Descriptive only: no "worsening" or "improving" label, no average
 * across different symptoms, and a block with nothing recorded is null,
 * never "none". Rows follow `categories` (the symptom summary's order).
 * Each log falls on her local day (see groupLogDatesByCategory).
 * Stored with the BRIEF and never sent to the AI.
 */
export function summarizeSeverityTrend(
  logs: Array<{ category: string; severity: string; occurredAt: Date }>,
  categories: string[],
  fromDay: string,
  toDay: string,
  timeZone = "UTC",
): SeverityTrendDto {
  const days = datesBetween(fromDay, toDay);
  const blockDays = days.length <= WEEKLY_TREND_MAX_DAYS ? 7 : 28;
  const blocks: SeverityTrendDto["blocks"] = [];
  for (let i = 0; i < days.length; i += blockDays) {
    blocks.push({ start: days[i]!, end: days[Math.min(i + blockDays, days.length) - 1]! });
  }
  const blockOf = new Map(days.map((day, i) => [day, Math.floor(i / blockDays)]));

  const cells = new Map(
    categories.map((category) => [
      category,
      blocks.map(() => ({ peak: -1, days: new Set<string>() })),
    ]),
  );
  for (const log of logs) {
    const day = localDate(log.occurredAt, timeZone);
    const block = blockOf.get(day);
    const row = cells.get(log.category);
    if (block === undefined || !row) continue;
    const cell = row[block]!;
    cell.peak = Math.max(cell.peak, SEVERITY_ORDER.indexOf(log.severity as SeverityLevel));
    cell.days.add(day);
  }

  return {
    blockDays,
    blocks,
    rows: categories.map((category) => ({
      category: category as SymptomCategory,
      cells: cells
        .get(category)!
        .map(({ peak, days: logged }) =>
          logged.size === 0 ? null : { peak: SEVERITY_ORDER[peak]!, daysLogged: logged.size },
        ),
    })),
  };
}
