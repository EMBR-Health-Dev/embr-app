// Exactly the five messages from the approved onboarding spec, keyed on
// jobToBeDone only — the spec's own example list didn't branch
// separately on appointmentStatus, so this doesn't invent a variant it
// wasn't given. Deliberately the only piece of "dashboard
// personalization" in this delivery — see docs/MILESTONES.md.
//
// Returns a translation key relative to the "Dashboard" namespace, not
// the message itself — this predates the i18n migration and was
// missed by it (it returned a plain string, so nothing calling
// useTranslations() flagged it). Found while building mobile's
// appointment card, which surfaces in the exact same screen area.
// dashboard/page.tsx's own `t` is already scoped to "Dashboard" via
// useTranslations("Dashboard"), so this returns relative keys
// ("startingPoint.x"), not full paths.
export function startingPointMessageKey(jobToBeDone: string | null): string | null {
  switch (jobToBeDone) {
    case "UNDERSTAND_EXPERIENCE":
      return "startingPoint.understandExperience";
    case "UNDERSTAND_PATTERNS":
      return "startingPoint.understandPatterns";
    case "PREPARE_FOR_APPOINTMENT":
      return "startingPoint.prepareForAppointment";
    case "KEEP_RECORD":
      return "startingPoint.keepRecord";
    case "NOT_SURE":
      return "startingPoint.notSure";
    default:
      return null;
  }
}
