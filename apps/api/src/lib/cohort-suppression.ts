/** The suppression decision only — deliberately not response-shape
 * construction. organization.service.ts's symptomFrequency() and
 * activation() have legitimately different response shapes when
 * suppressed (one returns {categories: []}, the other returns five
 * separate null fields) and each keeps building its own DTO; this
 * helper exists only so the boundary condition itself — strict `<`,
 * not `<=` — has exactly one implementation instead of two
 * independently written ones agreeing by coincidence.
 *
 * Strict less-than: a cohort exactly at the minimum is visible, not
 * suppressed. This preserves both existing call sites' current
 * behavior unchanged — neither used `<=`. */
export function isSuppressedByCohortSize(count: number, minimumCohortSize: number): boolean {
  return count < minimumCohortSize;
}
