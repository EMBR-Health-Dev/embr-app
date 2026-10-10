"use client";

import { useTranslations } from "next-intl";
import type { SymptomHistoryCategoryDto } from "@embr/types";

/** At most this many bars; the full list is the symptom history below. */
export const RANKING_MAX_BARS = 5;

// One shade per rank, darkest first. Colour marks position only, never
// severity or meaning, and every label stays readable on all of them.
const RANK_FILLS = [
  "bg-lilac-400",
  "bg-lilac-300",
  "bg-lilac-300/80",
  "bg-lilac-200",
  "bg-lilac-200/80",
];

/**
 * The symptoms with the most days logged in the range, longest bar
 * first. Bar length is days with an entry divided by the top symptom's
 * days, so the lengths compare exactly; the count is printed on every
 * bar. Counts only, no interpretation.
 */
export function SymptomRankingBars({
  categories,
  rangeFrom,
  rangeTo,
}: {
  categories: SymptomHistoryCategoryDto[];
  rangeFrom: string;
  rangeTo: string;
}) {
  const t = useTranslations("SymptomHistory");
  const tEnum = useTranslations("Enums");

  const ranked = categories
    .filter((c) => c.rangeDaysLogged > 0)
    .sort((a, b) => b.rangeDaysLogged - a.rangeDaysLogged || a.category.localeCompare(b.category))
    .slice(0, RANKING_MAX_BARS);
  if (ranked.length === 0) return null;
  const top = ranked[0]!.rangeDaysLogged;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground">{t("rankingTitle")}</h3>
      <p className="mt-1 text-xs text-foreground/60">
        {t("rankingSubtitle", { from: rangeFrom, to: rangeTo })}
      </p>
      <ol className="mt-3 flex flex-col gap-1">
        {ranked.map((c, i) => {
          const name = tEnum(`category.${c.category}`);
          const days = t("rankingDays", { count: c.rangeDaysLogged });
          return (
            <li
              key={c.category}
              className="relative min-h-10 overflow-hidden rounded-r-lg"
              aria-label={`${name}: ${days}`}
            >
              <div
                aria-hidden="true"
                data-testid={`ranking-bar-${c.category}`}
                className={`absolute inset-y-0 left-0 rounded-r-lg ${RANK_FILLS[i]}`}
                style={{ width: `${(c.rangeDaysLogged / top) * 100}%` }}
              />
              <div
                aria-hidden="true"
                className="relative flex min-h-10 items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{name}</span>
                <span className="shrink-0 tabular-nums text-foreground/80">{days}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
