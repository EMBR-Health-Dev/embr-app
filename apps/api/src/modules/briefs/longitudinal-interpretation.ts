import type { SymptomCategory } from "@embr/types";
import type { BriefTrendSummary } from "./brief-trends.js";

/**
 * Only one pattern type for this first step, deliberately. "Newly
 * emerging" (a category appearing for the first time in the single
 * most recent brief) was considered and dropped for now: telling it
 * apart from "appeared once, in some earlier brief" needs to know
 * which specific brief, by recency, a category's one occurrence falls
 * in — and BriefTrendSummary doesn't expose that today (its own doc
 * comment on brief-trends.ts is explicit that recency order and
 * chronological fromDate/toDate order aren't guaranteed to align, so
 * comparing against earliestBriefFromDate/latestBriefToDate would be
 * assuming something the existing contract deliberately doesn't
 * promise). Building it correctly means deliberately extending
 * BriefTrendSummary with an explicit "most recent brief" identifier
 * first — a real, separate, small piece of work, not something to
 * paper over with a guess here.
 */
export type LongitudinalPatternType = "recurring_across_briefs";

/** A brief window of exactly 1 can't establish anything longitudinal
 * — "recurring" requires recurring across more than one data point.
 * Exported so the service layer and any future caller share the same
 * number rather than two independently-chosen minimums drifting
 * apart, matching brief-trends.ts's own DEFAULT_TREND_BRIEF_LIMIT
 * convention. */
export const MIN_BRIEFS_FOR_LONGITUDINAL_PATTERNS = 2;

export interface LongitudinalPattern {
  /** Deterministic — built only from `type` and `category`, never
   * random, for the same reason stage4-interpretation.ts's
   * Stage4Pattern.id is deterministic: the same trend data always
   * produces the same id, which is what makes citation validation
   * possible for any future AI narration layer built on top of this
   * (see this file's own top-level doc comment on why that layer
   * doesn't exist yet). */
  id: string;
  type: LongitudinalPatternType;
  category: SymptomCategory;
  /** What the deterministic evidence directly establishes — counts,
   * never a claim about cause or clinical significance. Mirrors
   * Stage4Pattern.observation's own scope exactly. */
  observation: string;
  briefsPresent: number;
  totalBriefs: number;
}

/**
 * Pure, deterministic, side-effect-free — the exact same architectural
 * position stage4-interpretation.ts occupies for a single brief, one
 * level up: this reads already-aggregated BriefTrendSummary evidence
 * (itself already a pure aggregation over persisted ClinicalBrief
 * rows, per brief-trends.ts's own doc comment) and derives structured
 * patterns from it. No AI, no new database access, no raw SymptomLog
 * reads — everything here is already-computed evidence, interpreted
 * one layer further.
 *
 * "Recurring" is intentionally the strictest possible bar — present
 * in every single brief in the window, not merely "most" or "more
 * than half" — for the same reason period-comparison.ts's frequency
 * threshold stayed at "any change at all" rather than an invented
 * materiality cutoff: a threshold needs real beta usage data to set
 * defensibly, and an unambiguous, self-evidently-true bar needs none.
 * A category present in 5 of 6 briefs is still real, useful
 * information — just not claimed as "recurring" by this deliberately
 * conservative first pass.
 */
export function buildLongitudinalInterpretation(
  trends: Pick<BriefTrendSummary, "briefCount" | "categories">,
): LongitudinalPattern[] {
  if (trends.briefCount < MIN_BRIEFS_FOR_LONGITUDINAL_PATTERNS) {
    return [];
  }

  const patterns: LongitudinalPattern[] = [];
  for (const row of trends.categories) {
    if (row.briefsPresent === row.totalBriefs) {
      patterns.push({
        id: `recurring_across_briefs:${row.category}`,
        type: "recurring_across_briefs",
        category: row.category,
        observation: `${row.category} was reported in every one of your last ${row.totalBriefs} briefs.`,
        briefsPresent: row.briefsPresent,
        totalBriefs: row.totalBriefs,
      });
    }
  }
  return patterns;
}
