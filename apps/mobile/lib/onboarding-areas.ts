// Deliberately a separate, smaller vocabulary from SymptomCategory —
// see schema.prisma's OnboardingArea doc comment. The expansion below
// happens only client-side, purely to decide which categories get
// pre-highlighted on the first real logging screen; it is never sent
// back to the API and never becomes a SymptomLog. Ported verbatim from
// apps/web/src/lib/onboarding-areas.ts — the vocabulary must be
// identical on both platforms, not just similar.
export const ONBOARDING_AREA_LABELS: Record<string, string> = {
  SLEEP: "Sleep",
  ENERGY: "Energy",
  MOOD: "Mood",
  BODY: "Body",
  FOCUS: "Focus",
  CYCLE: "Cycle",
  OTHER: "Something else",
};

// CYCLE and OTHER are deliberately absent below, not mapped to an empty
// array — cycle changes are tracked through the separate CycleEntry
// flow on the dashboard (flow/period start/end), not a SymptomCategory
// at all, and OTHER is too broad to suggest any one category. Both
// fall through firstSuggestedCategory's own `?.[0]` to the generic
// "log something" entry point instead of a wrong or invented category.
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
