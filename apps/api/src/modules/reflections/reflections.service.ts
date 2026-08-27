import type { ReflectionDto, SymptomCategory } from "@embr/types";
import { trendsRepository } from "../trends/trends.repository.js";
import { generateReflections } from "./reflection-generator.js";

/** Same rolling window as the dashboard's existing weekly-frequency
 * line (apps/web/src/app/dashboard/page.tsx,
 * apps/mobile/app/(app)/index.tsx) — this endpoint exists specifically
 * to replace that ad-hoc client-side computation with a real,
 * testable reflection, so it has to use the identical window or the
 * numbers would visibly disagree with what users have already seen. */
const WEEKLY_WINDOW_DAYS = 7;

/** Long enough to catch any realistic ongoing streak without an
 * unbounded query — same reasoning as trendsRepository's own row caps
 * (CYCLE_ENTRY_ROW_CAP, SYMPTOM_LOG_ROW_CAP), just expressed as a date
 * window instead of a row count, since a streak's length is bounded by
 * calendar days, not by how many logs exist in them. */
const STREAK_LOOKBACK_DAYS = 60;

export const reflectionsService = {
  /** No parameters beyond userId — deliberately not accepting a
   * `now` override from the request the way trends' from/to query
   * does; reflections are always "as of right now," not a historical
   * query a client can ask about an arbitrary past date. */
  async list(userId: string): Promise<ReflectionDto[]> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEKLY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const streakLookback = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [weeklyRows, streakLookbackRows] = await Promise.all([
      trendsRepository.symptomLogsForCoOccurrence(userId, { from: weekAgo }),
      trendsRepository.symptomLogsForCoOccurrence(userId, { from: streakLookback }),
    ]);

    const loggedDates = new Set(
      streakLookbackRows.map((row) => row.occurredAt.toISOString().slice(0, 10)),
    );

    return generateReflections({
      weeklySymptomLogs: weeklyRows.map((row) => ({
        category: row.category as SymptomCategory,
        occurredAt: row.occurredAt,
      })),
      loggedDates,
      now,
    });
  },
};
