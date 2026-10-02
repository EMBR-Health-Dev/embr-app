"use client";

import { useTranslations } from "next-intl";
import { HISTORY_RANGES, type HistoryRange } from "../lib/record-history";

/**
 * Lets a person widen a view from the recent window to their whole
 * record. Same three choices wherever history is shown (Timeline,
 * Signals), so "Full record" always means the same thing.
 */
export function HistoryRangeSwitch({
  value,
  onChange,
  disabled,
}: {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("History");
  return (
    <div role="group" aria-label={t("rangeLabel")} className="mt-6 flex flex-wrap gap-2">
      {HISTORY_RANGES.map((range) => {
        const active = range === value;
        return (
          <button
            key={range}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(range)}
            className={`rounded-sm border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 ${
              active
                ? "border-lilac-700 bg-lilac-100 text-foreground"
                : "border-lilac-300 bg-background text-foreground hover:border-lilac-500"
            }`}
          >
            {t(`range.${range}`)}
          </button>
        );
      })}
    </div>
  );
}
