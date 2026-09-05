/**
 * Exactly the five messages from the approved onboarding spec, keyed
 * on jobToBeDone only — the spec's own example list didn't branch
 * separately on appointmentStatus, so this doesn't invent a variant
 * it wasn't given. Deliberately the only piece of "dashboard
 * personalization" in this delivery — see docs/MILESTONES.md.
 *
 * Returns a key *relative to a "startingPoint" namespace*, not the
 * message itself and not a fully-qualified translation key — each
 * platform's i18n setup scopes that namespace differently (web's
 * next-intl uses a per-screen `useTranslations("Dashboard")`, so this
 * key is used as-is; mobile's i18next has no such per-screen scoping
 * and prepends its own "home." prefix — see
 * apps/mobile/lib/onboarding-starting-point.ts). The jobToBeDone ->
 * copy mapping itself was previously duplicated verbatim in both
 * apps' onboarding-starting-point.ts; this is the one copy of it.
 */
const STARTING_POINT_KEYS: Record<string, string> = {
  UNDERSTAND_EXPERIENCE: "startingPoint.understandExperience",
  UNDERSTAND_PATTERNS: "startingPoint.understandPatterns",
  PREPARE_FOR_APPOINTMENT: "startingPoint.prepareForAppointment",
  KEEP_RECORD: "startingPoint.keepRecord",
  NOT_SURE: "startingPoint.notSure",
};

export function startingPointMessageKey(jobToBeDone: string | null): string | null {
  if (jobToBeDone === null) return null;
  return STARTING_POINT_KEYS[jobToBeDone] ?? null;
}
