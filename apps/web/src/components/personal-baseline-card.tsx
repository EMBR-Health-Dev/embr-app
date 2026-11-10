"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PersonalBaselineDto } from "@embr/types";
import { api } from "../lib/api";
import { SectionLabel } from "./section-label";
import { WhyAmISeeingThis } from "./why-am-i-seeing-this";

/**
 * Her usual week next to this week (apps/api personal-baseline.ts). It
 * compares her only with herself and shows two numbers side by side:
 * no arrows, colours or words like "higher" or "worse", because
 * whether a change matters is not something this record can say.
 */
export function PersonalBaselineCard() {
  const t = useTranslations("PersonalBaseline");
  const tEnum = useTranslations("Enums");
  const [result, setResult] = useState<PersonalBaselineDto | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.trends
      .personalBaseline()
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Supplementary, like the co-occurrence cards: nothing else depends on it.
  if (errored || !result) return null;

  return (
    <section
      className="mt-8 rounded-lg border border-border-subtle bg-surface p-6"
      role="region"
      aria-label={t("cardLabel")}
    >
      <SectionLabel>{t("cardLabel")}</SectionLabel>
      <h2 className="mt-3 font-display text-heading-m text-foreground">{t("heading")}</h2>
      <p className="mt-2 text-body-s text-foreground/60">{t("description")}</p>

      {!result.enoughHistory ? (
        <p className="mt-4 text-body-s text-foreground/80">
          {t("notEnoughHistory", { min: result.minBaselineWeeks, weeks: result.baselineWeeks })}
        </p>
      ) : result.items.length === 0 ? (
        <p className="mt-4 text-body-s text-foreground/80">{t("nothingRecorded")}</p>
      ) : (
        <table className="mt-4 w-full text-left text-body-s">
          <thead>
            <tr className="text-caption text-foreground/60">
              <th scope="col" className="py-2 font-medium">
                {t("symptomColumn")}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("thisWeekColumn")}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("usualColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.category} className="border-t border-border-subtle">
                <th scope="row" className="py-2 font-medium text-foreground">
                  {tEnum(`category.${item.category}`)}
                </th>
                <td className="py-2 pl-4 text-right text-foreground">
                  {t("days", { count: item.thisWeekDays })}
                </td>
                <td className="py-2 pl-4 text-right text-foreground/70">
                  {t("days", { count: item.usualWeekDays })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-caption text-foreground/50">{t("caveat")}</p>
      {result.enoughHistory && (
        <WhyAmISeeingThis>
          <p>{t("whyReasoning", { weeks: result.baselineWeeks })}</p>
        </WhyAmISeeingThis>
      )}
    </section>
  );
}
