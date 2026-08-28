/**
 * Deliberately a separate, smaller vocabulary from SymptomCategory —
 * see schema.prisma's OnboardingArea doc comment. The expansion below
 * happens only client-side, purely to decide which categories get
 * pre-highlighted on the first real logging screen; it is never sent
 * back to the API and never becomes a SymptomLog.
 *
 * Previously duplicated verbatim in apps/web and apps/mobile — the
 * mobile copy's own comment noted "the vocabulary must be identical
 * on both platforms, not just similar," which is exactly what having
 * one shared copy guarantees instead of relying on a comment to catch
 * drift.
 */
export const ONBOARDING_AREA_LABELS: Record<string, string> = {
  SLEEP: "Sleep",
  ENERGY: "Energy",
  MOOD: "Mood",
  BODY: "Body",
  FOCUS: "Focus",
};

export const ONBOARDING_AREA_TO_CATEGORIES: Record<string, string[]> = {
  SLEEP: ["SLEEP_DISTURBANCE", "NIGHT_SWEATS"],
  ENERGY: ["FATIGUE"],
  MOOD: ["MOOD_CHANGE", "ANXIETY"],
  BODY: [
    "HOT_FLASH",
    "JOINT_PAIN",
    "HEADACHE",
    "WEIGHT_CHANGE",
    "IRREGULAR_HEARTBEAT",
    "VAGINAL_DRYNESS",
    "LIBIDO_CHANGE",
  ],
  FOCUS: ["BRAIN_FOG"],
};

export function firstSuggestedCategory(noticedAreas: string[]): string | undefined {
  const firstArea = noticedAreas[0];
  return firstArea ? ONBOARDING_AREA_TO_CATEGORIES[firstArea]?.[0] : undefined;
}
