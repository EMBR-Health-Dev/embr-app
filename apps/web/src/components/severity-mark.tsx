import type { SeverityLevel } from "@embr/types";

const LEVEL: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

/**
 * Three rising bars, filled up to the severity: intensity shown by
 * shape and position as well as tone, so Mild, Moderate and Severe stay
 * distinct in greyscale and without colour. Decorative: the word next
 * to it carries the meaning for screen readers.
 */
export function SeverityMark({ severity }: { severity: SeverityLevel }) {
  const level = LEVEL[severity];
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`w-[3px] rounded-[1px] ${step <= level ? "bg-current" : "bg-current opacity-20"}`}
          style={{ height: `${4 + step * 3}px` }}
        />
      ))}
    </span>
  );
}
