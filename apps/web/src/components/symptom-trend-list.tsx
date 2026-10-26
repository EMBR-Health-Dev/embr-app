"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SeverityLevel, SymptomHistoryCategoryDto } from "@embr/types";
import { SeverityMark } from "./severity-mark";
import { trendBuckets, type TrendBucket, type TrendBuckets } from "../lib/trend-buckets";
import { formatHistoryDate, formatHistoryMonth } from "../lib/symptom-history-format";

const LEVELS: SeverityLevel[] = ["MILD", "MODERATE", "SEVERE"];

function shortDate(locale: string, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
    new Date(`${isoDate}T00:00:00`),
  );
}

/**
 * Each symptom recorded in the range: on how many days, at what highest
 * severity, and week by week (month by month over a year) so frequency
 * reads in time order. Counts are days, not entries, so a duplicate tap
 * never inflates a symptom.
 */
export function SymptomTrendList({
  categories,
  from,
  to,
}: {
  categories: SymptomHistoryCategoryDto[];
  from: string;
  to: string;
}) {
  const t = useTranslations("Trends");
  const tEnum = useTranslations("Enums");
  const rows = categories
    .filter((c) => c.rangeDaysLogged > 0)
    .sort((a, b) => b.rangeDaysLogged - a.rangeDaysLogged);

  if (rows.length === 0) {
    return (
      <>
        <p className="mt-3 text-body-s font-medium text-foreground">{t("noSymptomsYet")}</p>
        <p className="mt-1 text-body-s text-foreground/60">{t("noSymptomsBody")}</p>
      </>
    );
  }

  const monthly = trendBuckets(from, to, []).unit === "month";

  return (
    <>
      <p className="mt-2 text-caption text-foreground/60">
        {t(monthly ? "stripLegendMonthly" : "stripLegend")}
      </p>
      <ul className="mt-5 flex flex-col divide-y divide-border-subtle">
        {rows.map((row) => {
          const name = tEnum(`category.${row.category}`);
          return (
            <li key={row.category} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-4">
                <Link
                  href={`/timeline/${row.category}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {name}
                </Link>
                <span className="shrink-0 text-body-s text-foreground">
                  {t.rich("daysLogged", {
                    count: row.rangeDaysLogged,
                    n: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
                  })}
                </span>
              </div>
              <ul
                aria-label={t("severityDaysLabel")}
                className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-caption text-foreground/70"
              >
                {LEVELS.map((level) => (
                  <li key={level} className="inline-flex items-center gap-1.5 text-lilac-700">
                    <SeverityMark severity={level} size="sm" />
                    <span className="font-mono text-foreground/70 tabular-nums">
                      {row.rangeSeverityDays[level]}
                    </span>
                    <span className="sr-only">{tEnum(`severity.${level}`)}</span>
                  </li>
                ))}
              </ul>
              <TrendStrip name={name} buckets={trendBuckets(from, to, row.days)} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TrendStrip({ name, buckets }: { name: string; buckets: TrendBuckets }) {
  const t = useTranslations("Trends");
  const tEnum = useTranslations("Enums");
  const locale = useLocale();
  const weekly = buckets.unit === "week";
  const first = buckets.buckets[0];
  const last = buckets.buckets[buckets.buckets.length - 1];
  if (!first || !last) return null;

  function bucketLabel(bucket: TrendBucket): string {
    const period = weekly
      ? t("bucketWeek", { date: shortDate(locale, bucket.start) })
      : formatHistoryMonth(locale, bucket.start.slice(0, 7));
    if (!bucket.maxSeverity) return t("bucketNoEntry", { period });
    return t("bucketLogged", {
      period,
      count: bucket.daysLogged,
      length: bucket.length,
      severity: tEnum(`severity.${bucket.maxSeverity}`),
    });
  }

  return (
    <div className="mt-3">
      <ol
        aria-label={t(weekly ? "weekByWeek" : "monthByMonth", { category: name })}
        className="flex h-8 items-end gap-[3px] border-b border-foreground/15"
      >
        {buckets.buckets.map((bucket) => (
          <li
            key={bucket.start}
            className="flex h-full flex-1 items-end"
            title={bucketLabel(bucket)}
          >
            <span className="sr-only">{bucketLabel(bucket)}</span>
            {bucket.maxSeverity && (
              <span
                aria-hidden="true"
                className="block w-full rounded-t-[2px] bg-lilac-500"
                style={{
                  height: `${Math.max(12, (bucket.daysLogged / bucket.length) * 100)}%`,
                }}
              />
            )}
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="mt-1 flex justify-between text-caption text-foreground/50">
        <span>
          {weekly
            ? formatHistoryDate(locale, first.start)
            : formatHistoryMonth(locale, first.start.slice(0, 7))}
        </span>
        <span>
          {weekly ? t("stripEndWeek") : formatHistoryMonth(locale, last.start.slice(0, 7))}
        </span>
      </div>
    </div>
  );
}
