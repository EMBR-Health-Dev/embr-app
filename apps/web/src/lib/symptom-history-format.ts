import type { SeverityLevel } from "@embr/types";

/** "14 Jul 2026" style for a YYYY-MM-DD in the viewer's locale. */
export function formatHistoryDate(locale: string, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

export function formatHistoryMonth(locale: string, month: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(`${month}-01T00:00:00`),
  );
}

/**
 * Severity intensity for a logged day, darker for more severe. A day
 * with no entry never gets a fill: it is not a "zero" severity.
 */
export const SEVERITY_FILL: Record<SeverityLevel, string> = {
  MILD: "bg-lilac-300",
  MODERATE: "bg-lilac-500",
  SEVERE: "bg-lilac-700",
};

export const NO_ENTRY_CELL = "border border-foreground/15 bg-background";
