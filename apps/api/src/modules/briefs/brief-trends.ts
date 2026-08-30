import type { BriefSymptomSummaryEntryDto, SymptomCategory } from "@embr/types";

/** "Preferably 6" per the approved product scope — a deliberate,
 * explicit bound, not an unlimited historical analysis. Exported so
 * the service layer and any future caller share the exact same
 * number rather than two independently-chosen defaults drifting
 * apart. */
export const DEFAULT_TREND_BRIEF_LIMIT = 6;

/**
 * The minimal slice of a persisted ClinicalBrief this aggregation
 * actually reads — deliberately narrower than ClinicalBriefDto, so
 * this stays a pure function over exactly the fields it uses rather
 * than implicitly coupled to the full DTO shape (which also carries
 * aiNarrative, interpretation, treatment data, and other fields this
 * aggregation has no business touching).
 */
export interface BriefTrendSourceBrief {
  fromDate: string;
  toDate: string;
  symptomSummary: BriefSymptomSummaryEntryDto[];
  persistentSymptoms: SymptomCategory[] | null;
}

export interface BriefTrendCategoryRow {
  category: SymptomCategory;
  /** How many of the represented briefs reported this category at
   * all (from symptomSummary) — presence, not persistence. */
  briefsPresent: number;
  /** How many of the represented briefs had this category in their
   * own persisted persistentSymptoms — never inferred from
   * briefsPresent. A category can appear in every single brief and
   * still have briefsPersistent: 0, if persistent-symptoms.ts's own
   * floor rule never classified it that way in any of them; repeated
   * appearance and persistent classification are two different
   * signals from two different persisted fields, kept separate here
   * exactly as they are in the source data. */
  briefsPersistent: number;
  /** Same value on every row — the number of briefs this whole
   * aggregation actually ran over (see BriefTrendSummary.briefCount)
   * — repeated per-row because the approved field list calls for it
   * here specifically, so a UI rendering one row in isolation doesn't
   * need to reach into the parent object for it. */
  totalBriefs: number;
  mostRecentBriefFromDate: string;
  mostRecentBriefToDate: string;
}

export interface BriefTrendSummary {
  /** How many briefs this aggregation actually represents — always
   * <= the requested limit, and could be less for a user who simply
   * hasn't generated that many yet. This is what lets the UI say
   * "across your last 6 briefs" truthfully rather than implying a
   * fixed count that may not match reality. */
  briefCount: number;
  /** The actual min(fromDate)/max(toDate) across every brief in the
   * window — computed directly, not read off array position 0/last.
   * Recency (createdAt, which determines window order) and period
   * chronology (fromDate/toDate) aren't guaranteed to align — a
   * person could generate an older-dated brief after a more recent
   * one — so this doesn't assume the window is chronologically
   * monotonic just because it's recency-ordered. null only when
   * briefCount is 0. */
  earliestBriefFromDate: string | null;
  latestBriefToDate: string | null;
  categories: BriefTrendCategoryRow[];
}

/**
 * Pure, deterministic, side-effect-free aggregation over
 * already-persisted ClinicalBrief evidence. This is evidence
 * aggregation, not a new clinical inference engine: no new detection
 * logic, no AI, no raw SymptomLog access — every fact here already
 * existed on disk before this function ran, computed once at each
 * brief's own generation time by symptom-frequency.ts and
 * persistent-symptoms.ts.
 *
 * `briefs` must already be ordered most-recent-first — matching
 * brief.repository.ts's own `orderBy: { createdAt: "desc" }`. This
 * function has no comparable timestamp in the narrowed
 * BriefTrendSourceBrief shape to re-sort by, so it trusts the order
 * it's given and reads array position as recency; `mostRecentBrief*`
 * on each row is simply "the first brief in the given order that
 * mentioned this category."
 *
 * `limit` is enforced here, not just by the caller — the function
 * only ever aggregates over `briefs.slice(0, limit)`, so a caller
 * that accidentally passes more than intended still gets a correctly
 * bounded result rather than a silently-larger one.
 */
export function aggregateBriefTrends(
  briefs: BriefTrendSourceBrief[],
  limit: number = DEFAULT_TREND_BRIEF_LIMIT,
): BriefTrendSummary {
  const window = briefs.slice(0, limit);

  const rows = new Map<SymptomCategory, BriefTrendCategoryRow>();

  for (const brief of window) {
    // Deduplicated within this one brief first — a duplicated or
    // malformed persisted array must never let a single brief count
    // more than once toward its own category's totals. In practice
    // symptom-frequency.ts's Map-based aggregation already guarantees
    // each category appears at most once per brief, but this reads
    // persisted JSON off the database, not a value this function can
    // assume was constructed correctly — defended explicitly rather
    // than assumed.
    const presentThisBrief = new Set(brief.symptomSummary.map((entry) => entry.category));
    const persistentThisBrief = new Set(brief.persistentSymptoms ?? []);

    for (const category of presentThisBrief) {
      let row = rows.get(category);
      if (!row) {
        // Only set on first encounter — since `window` is
        // most-recent-first, the first brief a category is seen in
        // while iterating is, by construction, the most recent one
        // that mentioned it. Never overwritten on later iterations.
        row = {
          category,
          briefsPresent: 0,
          briefsPersistent: 0,
          totalBriefs: window.length,
          mostRecentBriefFromDate: brief.fromDate,
          mostRecentBriefToDate: brief.toDate,
        };
        rows.set(category, row);
      }

      row.briefsPresent += 1;
      // Only counted for a category this same brief also reported —
      // a persistentSymptoms entry with no matching symptomSummary
      // entry (which shouldn't happen given persistent-symptoms.ts's
      // own rule requires current-period presence, but this function
      // doesn't assume that invariant holds for every historical row)
      // is silently ignored rather than inflating presence on its
      // own; briefsPersistent can never exceed briefsPresent.
      if (persistentThisBrief.has(category)) {
        row.briefsPersistent += 1;
      }
    }
  }

  // Deterministic, and clinically useful as a default: most
  // frequently reported category first, alphabetical by category as
  // a stable tiebreak so two categories with equal counts never have
  // ambiguous relative order.
  const categories = [...rows.values()].sort((a, b) => {
    if (b.briefsPresent !== a.briefsPresent) return b.briefsPresent - a.briefsPresent;
    return a.category.localeCompare(b.category);
  });

  // ISO "YYYY-MM-DD" strings sort lexically in the same order as
  // chronologically — no Date parsing needed to find the actual
  // min/max across the window.
  let earliestBriefFromDate: string | null = null;
  let latestBriefToDate: string | null = null;
  for (const brief of window) {
    if (earliestBriefFromDate === null || brief.fromDate < earliestBriefFromDate) {
      earliestBriefFromDate = brief.fromDate;
    }
    if (latestBriefToDate === null || brief.toDate > latestBriefToDate) {
      latestBriefToDate = brief.toDate;
    }
  }

  return { briefCount: window.length, earliestBriefFromDate, latestBriefToDate, categories };
}
