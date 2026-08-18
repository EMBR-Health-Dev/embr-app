/**
 * BUSINESS DEFINITIONS — authoritative source. See OrgActivationDto's
 * doc comment in @embr/types for the customer-facing version of this
 * same text; keep both in sync if either changes. Changing any of
 * these three constants or the logic below changes what "activation"
 * means to a customer contractually relying on this number — treat
 * that as a product decision requiring sign-off, not a routine
 * refactor.
 *
 * - Eligible employee: has an accepted OrganizationMembership row.
 * - Activated employee: an eligible employee with at least one
 *   SymptomLog or CycleEntry within their first ACTIVATION_WINDOW_DAYS
 *   days after their own OrganizationMembership.createdAt — a
 *   per-member relative window, not a shared org-wide date range.
 * - Weekly active employee: an eligible employee with at least one
 *   SymptomLog or CycleEntry in the trailing WEEKLY_ACTIVE_WINDOW_DAYS
 *   days from a single shared `asOf` timestamp.
 *
 * Deliberately code constants, not environment variables — an env var
 * could be changed in production without a code review; these
 * specifically should not be changeable without one.
 */
export const ACTIVATION_WINDOW_DAYS = 30;
export const WEEKLY_ACTIVE_WINDOW_DAYS = 7;

export interface MembershipForActivation {
  userId: string;
  createdAt: Date;
}

export interface LoggedActivityRow {
  userId: string;
  occurredAt: Date;
}

/**
 * Pure, deterministic, no database access — the same
 * fetch-raw-rows-then-compute-in-application-code shape the
 * co-occurrence pattern engine (trends/co-occurrence.ts) already
 * established, for the same underlying reason: this is a per-member
 * relative-window computation, not a single shared WHERE clause a
 * database aggregate could express directly.
 *
 * activity should already be the union of relevant SymptomLog.occurredAt
 * and CycleEntry.date rows for every membership passed in — the OR
 * between the two tables is applied by the caller merging both arrays
 * before calling this, not by this function itself.
 */
export function computeActivatedUserIds(
  memberships: MembershipForActivation[],
  activity: LoggedActivityRow[],
  windowDays: number = ACTIVATION_WINDOW_DAYS,
): Set<string> {
  const activityByUser = new Map<string, Date[]>();
  for (const row of activity) {
    let dates = activityByUser.get(row.userId);
    if (!dates) {
      dates = [];
      activityByUser.set(row.userId, dates);
    }
    dates.push(row.occurredAt);
  }

  const activated = new Set<string>();
  for (const membership of memberships) {
    const dates = activityByUser.get(membership.userId);
    if (!dates) continue;

    const windowEnd = new Date(membership.createdAt);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    const hasActivityInWindow = dates.some((d) => d >= membership.createdAt && d <= windowEnd);
    if (hasActivityInWindow) activated.add(membership.userId);
  }

  return activated;
}

/**
 * A single shared window as of one point in time — unlike
 * computeActivatedUserIds above, every member is measured against the
 * same [asOf - windowDays, asOf] range, not their own join date.
 */
export function computeWeeklyActiveUserIds(
  eligibleUserIds: string[],
  activity: LoggedActivityRow[],
  asOf: Date,
  windowDays: number = WEEKLY_ACTIVE_WINDOW_DAYS,
): Set<string> {
  const windowStart = new Date(asOf);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const eligibleSet = new Set(eligibleUserIds);
  const active = new Set<string>();
  for (const row of activity) {
    if (!eligibleSet.has(row.userId)) continue;
    if (row.occurredAt >= windowStart && row.occurredAt <= asOf) {
      active.add(row.userId);
    }
  }

  return active;
}

/** Rounds to the nearest whole percent for display — matches
 * brief.service.ts's computeCycleSummary rounding its own average, not
 * left as a raw float for the frontend to format inconsistently. */
export function toPercentage(count: number, of: number): number {
  if (of === 0) return 0;
  return Math.round((count / of) * 100);
}
