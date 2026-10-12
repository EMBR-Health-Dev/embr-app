"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { api } from "../lib/api";
import {
  buildWeek,
  daysWithEntries,
  lastSevenDates,
  todaySteps,
  WEEK_DAYS,
  type DayRecord,
  type TodayStepKey,
} from "../lib/week-on-track";
import {
  BriefIcon,
  CheckCircleIcon,
  CircleIcon,
  DropletIcon,
  HeartPulseIcon,
  MoonIcon,
  SparkleIcon,
} from "./little-icons";

const STEP_TARGETS: Record<TodayStepKey, string> = {
  symptoms: "#check-in",
  context: "#context-entry",
  cycle: "#cycle-entry",
  brief: "/brief",
};

/**
 * Her last seven days at a glance and a short list for today, built
 * only from what she has recorded. It keeps her record complete for
 * the BRIEF; it never suggests anything about her health.
 */
export function WeekOnTrack({
  refreshKey,
  postmenopause,
  appointmentSoon,
  latestBriefCreatedAt,
  onStep,
}: {
  /** Called when she taps a step, so the page can open its form. */
  onStep?: (key: TodayStepKey) => void;
  refreshKey: number;
  postmenopause: boolean;
  appointmentSoon: boolean;
  latestBriefCreatedAt: string | null;
}) {
  const t = useTranslations("Week");
  const locale = useLocale();
  const [week, setWeek] = useState<DayRecord[] | null>(null);

  useEffect(() => {
    const dates = lastSevenDates();
    // One extra day back, so date-only entries are never cut off by the
    // time zone offset; buildWeek keeps only the seven dates.
    const from = new Date(`${dates[0]}T00:00:00`);
    from.setDate(from.getDate() - 1);
    const query = { from: from.toISOString(), pageSize: 100 };
    Promise.all([
      api.symptomLogs.list(query),
      api.contextLogs.list(query),
      api.cycleEntries.list(query),
    ])
      .then(([symptoms, context, cycle]) =>
        setWeek(
          buildWeek(
            dates,
            symptoms.items.map((s) => s.occurredAt),
            context.items.map((c) => c.date),
            cycle.items.map((c) => c.date),
          ),
        ),
      )
      .catch(() => setWeek(null));
  }, [refreshKey]);

  if (!week) return null;

  const today = week[week.length - 1]!;
  const steps = todaySteps({ today, appointmentSoon, latestBriefCreatedAt });
  const allDone = steps.every((s) => s.done || s.optional);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric" });
  const cycleLabel = postmenopause ? t("legendBleeding") : t("legendCycle");

  function stepLabel(key: TodayStepKey): string {
    if (key === "cycle") return postmenopause ? t("stepBleeding") : t("stepCycle");
    return t(`step${key.charAt(0).toUpperCase()}${key.slice(1)}` as "stepSymptoms");
  }

  return (
    <div className="mt-6 rounded-lg border border-border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-body-l text-foreground">{t("title")}</h2>
        <p className="text-sm text-foreground/60">
          {t("summary", { count: daysWithEntries(week), total: WEEK_DAYS })}
        </p>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {week.map((day, i) => {
          const date = new Date(`${day.date}T00:00:00`);
          const isToday = i === week.length - 1;
          const recorded = [
            day.symptoms ? t("legendSymptoms") : null,
            day.context ? t("legendContext") : null,
            day.cycle ? cycleLabel : null,
          ].filter((v): v is string => v !== null);
          return (
            <li
              key={day.date}
              aria-label={`${weekdayLong.format(date)}: ${
                recorded.length > 0
                  ? t("dayRecorded", { items: recorded.join(", ") })
                  : t("dayNothing")
              }`}
              className={`flex flex-col items-center gap-1.5 rounded-md px-1 py-2 ${
                isToday ? "bg-lilac-100 ring-1 ring-lilac-300" : ""
              }`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-foreground/50">
                {weekday.format(date)}
              </span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {date.getDate()}
              </span>
              <span className="flex flex-col items-center gap-1" aria-hidden="true">
                <HeartPulseIcon
                  size={16}
                  className={day.symptoms ? "text-lilac-700" : "text-foreground/15"}
                />
                <MoonIcon
                  size={16}
                  className={day.context ? "text-lilac-700" : "text-foreground/15"}
                />
                <DropletIcon
                  size={16}
                  className={day.cycle ? "text-lilac-700" : "text-foreground/15"}
                />
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60">
        <span className="inline-flex items-center gap-1">
          <HeartPulseIcon size={14} className="text-lilac-700" />
          {t("legendSymptoms")}
        </span>
        <span className="inline-flex items-center gap-1">
          <MoonIcon size={14} className="text-lilac-700" />
          {t("legendContext")}
        </span>
        <span className="inline-flex items-center gap-1">
          <DropletIcon size={14} className="text-lilac-700" />
          {cycleLabel}
        </span>
      </p>

      <h3 className="mt-5 text-sm font-medium text-foreground">{t("todayTitle")}</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {steps.map((step) => {
          const href = STEP_TARGETS[step.key];
          const label = (
            <>
              {step.done ? (
                <CheckCircleIcon size={20} className="shrink-0 text-lilac-700" />
              ) : step.key === "brief" ? (
                <BriefIcon size={20} className="shrink-0 text-foreground/45" />
              ) : (
                <CircleIcon size={20} className="shrink-0 text-foreground/30" />
              )}
              <span className="flex flex-col">
                <span className={step.done ? "text-foreground/50 line-through" : "text-foreground"}>
                  {stepLabel(step.key)}
                </span>
                {step.optional && !step.done && (
                  <span className="text-xs text-foreground/45">{t("optional")}</span>
                )}
              </span>
              <span className="sr-only">{step.done ? t("done") : t("notDone")}</span>
            </>
          );
          const className =
            "flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60";
          return (
            <li key={step.key}>
              {href.startsWith("/") ? (
                <Link href={href} className={className}>
                  {label}
                </Link>
              ) : (
                <a href={href} className={className} onClick={() => onStep?.(step.key)}>
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 text-sm text-foreground/60">
        {allDone && <SparkleIcon size={16} className="text-lilac-700" />}
        {allDone ? t("allDone") : t("encouragement")}
      </p>
    </div>
  );
}
