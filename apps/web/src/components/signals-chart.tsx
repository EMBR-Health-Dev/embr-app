"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SeverityLevel, SymptomHistoryCategoryDto, SymptomHistoryDayDto } from "@embr/types";
import { SeverityMark } from "./severity-mark";
import { trendBuckets, type TrendBucket } from "../lib/trend-buckets";
import { formatHistoryDate, formatHistoryMonth } from "../lib/symptom-history-format";

const RANK: Record<SeverityLevel, number> = { MILD: 1, MODERATE: 2, SEVERE: 3 };

function shortDate(locale: string, isoDate: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
    new Date(`${isoDate}T00:00:00`),
  );
}

function monthLabel(locale: string, isoDate: string, withYear: boolean): string {
  return new Intl.DateTimeFormat(
    locale,
    withYear ? { month: "short", year: "numeric" } : { month: "short" },
  ).format(new Date(`${isoDate}T00:00:00`));
}

/** Days with any symptom entry, at the highest severity recorded that day. */
function anyEntryDays(categories: SymptomHistoryCategoryDto[]): SymptomHistoryDayDto[] {
  const byDate = new Map<string, SymptomHistoryDayDto>();
  for (const category of categories) {
    for (const day of category.days) {
      const seen = byDate.get(day.date);
      if (!seen || RANK[day.maxSeverity] > RANK[seen.maxSeverity]) {
        byDate.set(day.date, { date: day.date, maxSeverity: day.maxSeverity, entries: 1 });
      }
    }
  }
  return [...byDate.values()];
}

interface Row {
  key: string;
  label: string;
  href?: string;
  days: number;
  buckets: TrendBucket[];
}

const STEP_BUTTON =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-lilac-300 text-lg text-foreground hover:border-lilac-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

/**
 * Every symptom recorded in the range on one shared time axis, oldest
 * on the left, a week per column (a month beyond a year), so the same
 * week reads across symptoms. The first row is days with any entry,
 * which tells a stretch with no entries at all apart from a symptom
 * simply not recorded. Choosing a column lists that week's symptoms
 * with their highest severity. Counts are days, not entries.
 */
export function SignalsChart({
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
  const locale = useLocale();
  // null follows the newest column.
  const [picked, setPicked] = useState<number | null>(null);

  const recorded = categories
    .filter((c) => c.rangeDaysLogged > 0)
    .sort((a, b) => b.rangeDaysLogged - a.rangeDaysLogged);

  if (recorded.length === 0) {
    return (
      <>
        <p className="mt-3 text-body-s font-medium text-foreground">{t("noSymptomsYet")}</p>
        <p className="mt-1 text-body-s text-foreground/60">{t("noSymptomsBody")}</p>
      </>
    );
  }

  const any = trendBuckets(from, to, anyEntryDays(recorded));
  const weekly = any.unit === "week";
  const columns = any.buckets;
  const newest = columns.length - 1;
  const selected = Math.min(picked ?? newest, newest);
  const column = columns[selected]!;
  const totalDays = columns.reduce((sum, b) => sum + b.length, 0);
  const anyDays = columns.reduce((sum, b) => sum + b.daysLogged, 0);

  const rows: Row[] = [
    { key: "ANY", label: t("anyEntryRow"), days: anyDays, buckets: columns },
    ...recorded.map((c) => ({
      key: c.category,
      label: tEnum(`category.${c.category}`),
      href: `/timeline/${c.category}`,
      days: c.rangeDaysLogged,
      buckets: trendBuckets(from, to, c.days).buckets,
    })),
  ];

  function periodLabel(bucket: TrendBucket): string {
    return weekly
      ? t("bucketWeek", { date: shortDate(locale, bucket.start) })
      : formatHistoryMonth(locale, bucket.start.slice(0, 7));
  }

  function bucketLabel(bucket: TrendBucket): string {
    const period = periodLabel(bucket);
    if (!bucket.maxSeverity) return t("bucketNoEntry", { period });
    return t("bucketLogged", {
      period,
      count: bucket.daysLogged,
      length: bucket.length,
      severity: tEnum(`severity.${bucket.maxSeverity}`),
    });
  }

  // Month names over the columns where a new month begins (each January
  // when a column is a month).
  const axisLabels = columns.flatMap((bucket, i) => {
    const prev = columns[i - 1];
    const show = weekly
      ? !prev || prev.start.slice(0, 7) !== bucket.start.slice(0, 7)
      : i === 0 || bucket.start.slice(5, 7) === "01";
    // A label too close to the right edge would overflow the chart.
    if (!show || (i > 0 && i / columns.length > 0.9)) return [];
    return [{ i, text: monthLabel(locale, bucket.start, !weekly) }];
  });
  // When the first column is a few days of a month, its label would
  // collide with the next month's; the next one wins.
  if (axisLabels.length > 1 && (axisLabels[1]!.i - axisLabels[0]!.i) / columns.length < 0.12) {
    axisLabels.shift();
  }

  const inColumn = rows
    .slice(1)
    .map((row) => ({ row, bucket: row.buckets[selected]! }))
    .filter(({ bucket }) => bucket.maxSeverity !== null);

  const highlight = (i: number) => (i === selected ? "bg-lilac-100" : "");

  return (
    <div className="mt-4">
      <p className="text-caption text-foreground/60">
        {t(weekly ? "chartLegend" : "chartLegendMonthly")}
      </p>
      <p className="mt-3 text-body-s text-foreground">
        {t.rich("coverage", {
          days: anyDays,
          total: totalDays,
          n: (chunks) => <span className="font-mono font-medium tabular-nums">{chunks}</span>,
        })}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-x-4 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div aria-hidden="true" className="hidden sm:block" />
        <div aria-hidden="true" className="relative h-5 text-caption text-foreground/50">
          {axisLabels.map(({ i, text }) => (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap border-l border-foreground/25 pl-1 leading-5"
              style={{ left: `${(i / columns.length) * 100}%` }}
            >
              {text}
            </span>
          ))}
        </div>

        {rows.map((row, rowIndex) => (
          <div key={row.key} className="contents">
            <div className="flex items-baseline justify-between gap-3 pt-3 sm:block sm:pt-4">
              {row.href ? (
                <Link
                  href={row.href}
                  className="text-body-s font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {row.label}
                </Link>
              ) : (
                <span className="text-body-s text-foreground/70">{row.label}</span>
              )}
              <span className="block text-caption text-foreground/60">
                {t.rich("daysLogged", {
                  count: row.days,
                  n: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
                })}
              </span>
            </div>
            <ol
              aria-label={t(weekly ? "weekByWeek" : "monthByMonth", { category: row.label })}
              className={`mt-1 flex h-9 items-end border-b sm:mt-3 ${
                rowIndex === 0 ? "border-foreground/30" : "border-foreground/15"
              }`}
            >
              {row.buckets.map((bucket, i) => (
                <li
                  key={bucket.start}
                  className={`flex h-full flex-1 items-end px-px sm:px-[1.5px] ${highlight(i)}`}
                >
                  <span className="sr-only">{bucketLabel(bucket)}</span>
                  {bucket.daysLogged > 0 && (
                    <span
                      aria-hidden="true"
                      className={`block w-full rounded-t-[2px] ${
                        rowIndex === 0 ? "bg-graphite-500" : "bg-lilac-500"
                      }`}
                      style={{
                        height: `${Math.max(12, (bucket.daysLogged / bucket.length) * 100)}%`,
                      }}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}

        {/* A pointer shortcut to pick a column; the step buttons below
            are the keyboard and screen reader path. */}
        <div aria-hidden="true" className="hidden sm:block" />
        <div aria-hidden="true" className="flex">
          {columns.map((bucket, i) => (
            <div
              key={bucket.start}
              onClick={() => setPicked(i)}
              className={`h-5 flex-1 cursor-pointer ${highlight(i)}`}
            />
          ))}
        </div>
        <div aria-hidden="true" className="hidden sm:block" />
        <div
          aria-hidden="true"
          className="mt-1 flex justify-between text-caption text-foreground/50"
        >
          <span>
            {weekly
              ? formatHistoryDate(locale, columns[0]!.start)
              : formatHistoryMonth(locale, columns[0]!.start.slice(0, 7))}
          </span>
          <span>
            {weekly
              ? t("stripEndWeek")
              : formatHistoryMonth(locale, columns[newest]!.start.slice(0, 7))}
          </span>
        </div>
      </div>

      <section
        aria-labelledby="signals-selected-period"
        className="mt-6 rounded-md border border-border-subtle bg-background p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPicked(selected - 1)}
            disabled={selected === 0}
            aria-label={t(weekly ? "earlierWeek" : "earlierMonth")}
            className={STEP_BUTTON}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <h3
            id="signals-selected-period"
            aria-live="polite"
            className="text-center font-sans text-body-s font-medium text-foreground"
          >
            {weekly && selected === newest ? t("stripEndWeek") : periodLabel(column)}
            <span className="block text-caption font-normal text-foreground/60">
              {t("periodSpan", {
                from: formatHistoryDate(locale, column.start),
                to: formatHistoryDate(locale, column.end),
              })}
            </span>
          </h3>
          <button
            type="button"
            onClick={() => setPicked(selected + 1)}
            disabled={selected === newest}
            aria-label={t(weekly ? "laterWeek" : "laterMonth")}
            className={STEP_BUTTON}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
        {inColumn.length === 0 ? (
          <p className="mt-3 text-body-s text-foreground/70">
            {t(weekly ? "weekNoEntry" : "monthNoEntry")}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle">
            {inColumn.map(({ row, bucket }) => (
              <li
                key={row.key}
                className="flex flex-col gap-1 py-2.5 text-body-s sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="text-foreground">{row.label}</span>
                <span className="inline-flex items-center gap-3 text-foreground/70">
                  {t("periodDays", { count: bucket.daysLogged, length: bucket.length })}
                  <span className="inline-flex items-center gap-1.5 text-lilac-700">
                    <SeverityMark severity={bucket.maxSeverity!} />
                    <span className="text-foreground/70">
                      {tEnum(`severity.${bucket.maxSeverity!}`)}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
