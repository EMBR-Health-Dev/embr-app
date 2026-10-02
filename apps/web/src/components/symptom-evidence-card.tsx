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
 * One symptom's record as a ruled row, in four answers and nothing
 * else: what, how often, what is happening recently, and when. Plain
 * type rather than a card or a large figure, so a short record does
 * not look more significant than it is. No interpretation around it.
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
    <li className="border-t border-border-subtle py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-medium text-foreground">{name}</h3>
        <p className="text-sm text-foreground">
          {t("daysOfLast", { count: history.daysLoggedLast42, total: FREQUENCY_WINDOW_DAYS })}
        </p>
      </div>

      <p className="mt-1 text-sm text-foreground/70">
        {state === "not_logged_recently" ? (
          <>
            <span className="font-medium text-foreground">{t("notLoggedRecently")}</span>
            {". "}
            {t("notLoggedInLast", { days: gapDays })}
          </>
        ) : (
          t("loggedOnDaysOfLast", { count: history.daysLoggedLast7, total: RECENT_WINDOW_DAYS })
        )}
      </p>

      <dl className="mt-1 flex flex-wrap gap-x-4 text-xs text-foreground/60">
        <div className="flex gap-1">
          <dt>{t("firstLogged")}</dt>
          <dd className="text-foreground/80">{formatHistoryDate(locale, history.firstLoggedOn)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>{t("lastLogged")}</dt>
          <dd className="text-foreground/80">{formatHistoryDate(locale, history.lastLoggedOn)}</dd>
        </div>
      </dl>

      <Link
        href={`/timeline/${history.category}`}
        aria-label={t("viewHistoryFor", { symptom: name })}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-lilac-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {t("viewHistory")}
      </Link>
    </li>
  );
}
