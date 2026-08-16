// Exactly the five messages from the approved onboarding spec, keyed on
// jobToBeDone only — ported verbatim from
// apps/web/src/lib/onboarding-starting-point.ts. The copy must be
// identical on both platforms, not just similar.
//
// Returns a translation key, not the message itself — this was missed
// during the i18n migration (this function predates it and returns a
// plain string, so nothing calling useTranslation() flagged it), found
// while building the appointment card, which sits in the exact same
// screen area. Callers must pass the result through t().
export function startingPointMessageKey(jobToBeDone: string | null): string | null {
  switch (jobToBeDone) {
    case "UNDERSTAND_EXPERIENCE":
      return "home.startingPoint.understandExperience";
    case "UNDERSTAND_PATTERNS":
      return "home.startingPoint.understandPatterns";
    case "PREPARE_FOR_APPOINTMENT":
      return "home.startingPoint.prepareForAppointment";
    case "KEEP_RECORD":
      return "home.startingPoint.keepRecord";
    case "NOT_SURE":
      return "home.startingPoint.notSure";
    default:
      return null;
  }
}
