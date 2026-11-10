"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { NextDayContextDto } from "@embr/types";
import { api } from "../lib/api";
import { SectionLabel } from "./section-label";
import { WhyAmISeeingThis } from "./why-am-i-seeing-this";

/**
 * What she recorded on the day after a context factor, next to the day
 * after other days (apps/api next-day-context.ts). Shows both counts as
 * they are, never a ratio or "x times as often", and never a word that
 * suggests the factor causes the symptom. Like ContextCoOccurrenceCard
 * it carries no clinician-question layer: the evidence on these
 * factors is thin, and a fixed question here would overstate it.
 */
export function NextDayContextCard({ from, to }: { from?: string; to?: string }) {
  const t = useTranslations("NextDayContext");
  const tEnum = useTranslations("Enums");
  const [results, setResults] = useState<NextDayContextDto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.trends
      .nextDayContext({ from, to })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  // Nothing qualifying is the common case; the card simply doesn't render.
  if (!results || results.length === 0) return null;

  return (
    <section
      className="mt-8 rounded-lg border border-border-subtle bg-surface p-6"
      role="region"
      aria-label={t("heading")}
    >
      <SectionLabel>{t("cardLabel")}</SectionLabel>
      <h2 className="mt-3 font-display text-heading-m text-foreground">{t("heading")}</h2>

      <ul className="mt-4 space-y-4">
        {results.map((r) => {
          const category = tEnum(`category.${r.category}`);
          const factor = tEnum(`contextFactor.${r.factor}`);
          return (
            <li key={`${r.factor}-${r.category}`}>
              <h3 className="text-body-s font-semibold text-foreground">
                {t("findingHeading", { category, factor })}
              </h3>
              <p className="mt-1 text-body-s text-foreground">
                {t("afterFactor", { days: r.afterFactorDays, total: r.afterFactorTotal, factor })}
              </p>
              <p className="text-body-s text-foreground/70">
                {t("afterOther", { days: r.otherDays, total: r.otherTotal })}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-caption text-foreground/50">{t("caveat")}</p>
      <WhyAmISeeingThis>
        <p>{t("whyReasoning")}</p>
      </WhyAmISeeingThis>
    </section>
  );
}
