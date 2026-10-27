import type { MrsCheckInDto } from "@embr/types";

/**
 * Whether this build shows the monthly Menopause Rating Scale check-in.
 * Off unless NEXT_PUBLIC_MRS_CHECK_IN_ENABLED is "true": the MRS is
 * copyrighted and commercial use is not yet confirmed. The API has its
 * own switch (MRS_CHECK_IN_ENABLED) and answers 404 while off.
 */
export const MRS_CHECK_IN_ENABLED = process.env.NEXT_PUBLIC_MRS_CHECK_IN_ENABLED === "true";

/** Offered again once the last check-in is this many days old. */
export const MRS_INTERVAL_DAYS = 28;

/** English only until the validated Japanese version is licensed. */
export function mrsAvailable(locale: string): boolean {
  return MRS_CHECK_IN_ENABLED && locale === "en";
}

function utcDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;
}

/** Due when she has never done one, or the latest is 28 or more days old. */
export function isMrsDue(checkIns: Pick<MrsCheckInDto, "completedOn">[], today: string): boolean {
  const latest = checkIns.reduce<string | null>(
    (max, c) => (max === null || c.completedOn > max ? c.completedOn : max),
    null,
  );
  return latest === null || utcDay(today) - utcDay(latest) >= MRS_INTERVAL_DAYS;
}
