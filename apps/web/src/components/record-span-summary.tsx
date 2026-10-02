"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RecordSpan } from "../lib/record-history";

/**
 * How far back the person's record goes and what is in it — shown where
 * the record is browsed, so the whole history is visible even when a
 * view is scoped to a recent window. Renders nothing for an empty record.
 */
export function RecordSpanSummary({
  span,
  showTimelineLink = false,
}: {
  span: RecordSpan;
  showTimelineLink?: boolean;
}) {
  const t = useTranslations("History");
  const locale = useLocale();
  if (!span.start) return null;

  const since = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${span.start}T00:00:00`));

  return (
    <div className="mt-4 rounded-sm border-l-[3px] border-l-lilac-600 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{t("recordSince", { date: since })}</p>
      <p className="mt-0.5 text-sm text-foreground/70">
        {t("recordSummary", {
          symptoms: span.symptomCount,
          cycle: span.cycleCount,
          treatments: span.treatmentCount,
        })}
      </p>
      {showTimelineLink && (
        <Link
          href="/timeline?range=all"
          className="mt-1 inline-block text-sm font-medium text-lilac-700 underline underline-offset-2"
        >
          {t("viewFullTimeline")}
        </Link>
      )}
    </div>
  );
}
