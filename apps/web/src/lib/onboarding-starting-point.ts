// Exactly the five messages from the approved onboarding spec, keyed on
// jobToBeDone only — the spec's own example list didn't branch
// separately on appointmentStatus, so this doesn't invent a variant it
// wasn't given. Deliberately the only piece of "dashboard
// personalization" in this delivery — see docs/MILESTONES.md.
export function startingPointMessage(jobToBeDone: string | null): string | null {
  switch (jobToBeDone) {
    case "UNDERSTAND_EXPERIENCE":
      return "Let's start building your record.";
    case "UNDERSTAND_PATTERNS":
      return "You're here to understand patterns. We'll start surfacing them as you log.";
    case "PREPARE_FOR_APPOINTMENT":
      return "You're preparing for a healthcare conversation. Let's help you build something concrete.";
    case "KEEP_RECORD":
      return "Let's start building your record over time.";
    case "NOT_SURE":
      return "Let's see what your record starts to show.";
    default:
      return null;
  }
}
