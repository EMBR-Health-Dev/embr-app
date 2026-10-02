"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SymptomHistoryCategoryDto } from "@embr/types";
import {
  FREQUENCY_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  symptomRecordState,
} from "../lib/symptom-evidence";
import { formatHistoryDate } from "../lib/symptom-history-format";

/**
 * One symptom's record, in four answers and nothing else: what, when,
 * how often, and what is happening recently. The numbers are the
 * evidence; there is deliberately no interpretation around them.
 */
export function SymptomEvidenceCard({
  history,
  gapDays,
}: {
  history: SymptomHistoryCategoryDto;
  gapDays: number;
}) {
  const t = useTranslations("SymptomHistory");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const state = symptomRecordState(history);
  const name = tEnum(`category.${history.category}`);

  return (
    <li className="flex flex-col rounded-lg border border-border-subtle border-l-4 border-l-lilac-500 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-foreground">{name}</h3>
        {state === "not_logged_recently" && (
          <span className="shrink-0 rounded-sm border border-lilac-300 px-2 py-0.5 text-xs text-lilac-700">
            {t("notLoggedRecently")}
          </span>
        )}
      </div>

      <p className="mt-2 font-display text-heading-m text-lilac-700">
        {t("daysOfLast", { count: history.daysLoggedLast42, total: FREQUENCY_WINDOW_DAYS })}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-foreground/60">{t("firstLogged")}</dt>
        <dd className="text-foreground">{formatHistoryDate(locale, history.firstLoggedOn)}</dd>
        <dt className="text-foreground/60">{t("lastLogged")}</dt>
        <dd className="text-foreground">{formatHistoryDate(locale, history.lastLoggedOn)}</dd>
      </dl>

      <p className="mt-3 text-sm text-foreground/80">
        {state === "not_logged_recently"
          ? t("notLoggedInLast", { days: gapDays })
          : t("loggedOnDaysOfLast", { count: history.daysLoggedLast7, total: RECENT_WINDOW_DAYS })}
      </p>

      <Link
        href={`/timeline/${history.category}`}
        aria-label={t("viewHistoryFor", { symptom: name })}
        className="mt-3 self-start text-sm font-medium text-lilac-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("viewHistory")}
      </Link>
    </li>
  );
}
