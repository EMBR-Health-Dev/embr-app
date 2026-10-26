"use client";

import { useLocale, useTranslations } from "next-intl";
import type { TreatmentDto } from "@embr/types";
import { timelineAxis } from "../lib/treatment-span";
import { formatHistoryDate } from "../lib/symptom-history-format";

function tickLabel(locale: string, isoDate: string, label: "month" | "year"): string {
  return new Intl.DateTimeFormat(
    locale,
    label === "year" ? { year: "numeric" } : { month: "short" },
  ).format(new Date(`${isoDate}T00:00:00`));
}

/**
 * Every treatment as a span on one shared axis, earliest start at the
 * top, so overlaps and gaps read at a glance. An ongoing treatment runs
 * to today and says so in words; an ended one stops at its end date.
 */
export function TreatmentTimeline({
  treatments,
  today,
}: {
  treatments: TreatmentDto[];
  today: string;
}) {
  const t = useTranslations("Treatments");
  const locale = useLocale();
  const axis = timelineAxis(
    treatments.map((tr) => tr.startDate),
    today,
  );
  const rows = [...treatments].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <section
      aria-labelledby="treatment-timeline"
      className="mt-8 rounded-lg border border-border-subtle bg-surface p-5 sm:p-6"
    >
      <h2 id="treatment-timeline" className="font-display text-heading-m text-foreground">
        {t("timelineHeading")}
      </h2>
      <p className="mt-1 text-caption text-foreground/60">{t("timelineHint")}</p>

      <div aria-hidden="true" className="relative mt-5 h-5 text-caption text-foreground/50">
        {axis.ticks.map((tick) => (
          <span
            key={tick.date}
            className="absolute top-0 whitespace-nowrap border-l border-foreground/25 pl-1 leading-5"
            style={{ left: `${axis.at(tick.date) * 100}%` }}
          >
            {tickLabel(locale, tick.date, tick.label)}
          </span>
        ))}
      </div>

      <ol className="mt-1 flex flex-col gap-3">
        {rows.map((tr) => {
          const ongoing = !tr.endDate;
          const left = axis.at(tr.startDate);
          const right = axis.at(tr.endDate ?? today);
          const span = ongoing
            ? t("timelineOngoing", { from: formatHistoryDate(locale, tr.startDate) })
            : t("timelineEnded", {
                from: formatHistoryDate(locale, tr.startDate),
                to: formatHistoryDate(locale, tr.endDate!),
              });
          return (
            <li key={tr.id}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-body-s">
                <span className="font-medium text-foreground">{tr.name}</span>
                <span className="text-caption text-foreground/60">{span}</span>
              </p>
              <div aria-hidden="true" className="relative mt-1.5 h-3 rounded-full bg-muted">
                <div
                  className={`absolute inset-y-0 min-w-1.5 ${
                    ongoing
                      ? "rounded-l-full bg-lilac-500"
                      : "rounded-full border border-graphite-500 bg-graphite-100"
                  }`}
                  style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="mt-2 flex justify-between text-caption text-foreground/50">
        <span>{formatHistoryDate(locale, axis.start)}</span>
        <span>{t("timelineToday")}</span>
      </div>
    </section>
  );
}
