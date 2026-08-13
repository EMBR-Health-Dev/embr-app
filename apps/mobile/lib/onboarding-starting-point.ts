// Exactly the five messages from the approved onboarding spec, keyed on
// jobToBeDone only — ported verbatim from
// apps/web/src/lib/onboarding-starting-point.ts. The copy must be
// identical on both platforms, not just similar.
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
