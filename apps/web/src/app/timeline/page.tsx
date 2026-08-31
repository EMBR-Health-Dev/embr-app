"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TimelineEventDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";

const WINDOW_DAYS = 180;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Small, deliberately neutral marker per event type — a dot color and
 * a one-glyph icon, not an illustration. Matches this app's existing
 * "calm, clinical, not gamified" design doctrine: distinguishable at a
 * glance without turning the timeline into a decorated feed. */
const EVENT_STYLE: Record<TimelineEventDto["type"], { dot: string; icon: string }> = {
  SYMPTOM_WEEK: { dot: "bg-brass", icon: "\u25CF" }, // ●
  TREATMENT_STARTED: { dot: "bg-teal", icon: "\u25B8" }, // ▸
  TREATMENT_ENDED: { dot: "bg-navy/30", icon: "\u25B9" }, // ▹
  BRIEF_GENERATED: { dot: "bg-navy", icon: "\u2726" }, // ✦
};

export default function TimelinePage() {
  const t = useTranslations("Timeline");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { user, loading } = useAuth();

  const [events, setEvents] = useState<TimelineEventDto[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    api.timeline
      .get({ from: daysAgoIso(WINDOW_DAYS) })
      .then(setEvents)
      .finally(() => setDataLoading(false));
  }, [user]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-navy">{t("title")}</h1>
          <p className="mt-1 text-sm text-navy/50">{t("subtitle")}</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          {t("backToDashboard")}
        </Link>
      </header>

      <p className="mt-6 text-xs uppercase tracking-wide text-navy/40">
        {t("windowLabel", { days: WINDOW_DAYS })}
      </p>

      {dataLoading ? (
        <p className="mt-8 text-sm text-navy/50">{tCommon("loading")}</p>
      ) : events.length === 0 ? (
        <p className="mt-8 text-sm text-navy/50">{t("empty")}</p>
      ) : (
        <ol className="mt-6 border-l-2 border-navy/10 pl-6">
          {events.map((event, i) => {
            const style = EVENT_STYLE[event.type];
            return (
              <li key={`${event.type}-${event.date}-${i}`} className="relative pb-8 last:pb-0">
                <span
                  className={`absolute -left-[1.72rem] top-1 h-3 w-3 rounded-full ${style.dot}`}
                  aria-hidden="true"
                />
                <p className="text-xs text-navy/40">{event.date}</p>

                {event.type === "SYMPTOM_WEEK" && (
                  <div className="mt-1">
                    <p className="text-sm font-medium text-navy">
                      {t("symptomWeekTitle", { weekStart: event.weekStart })}
                    </p>
                    <p className="mt-0.5 text-sm text-navy/60">
                      {t("symptomWeekCount", { count: event.totalCount })}
                      {event.percentChangeFromPreviousNonEmptyWeek !== null && (
                        <span className="ml-2 text-navy/40">
                          {event.percentChangeFromPreviousNonEmptyWeek >= 0
                            ? t("symptomWeekChangeUp", {
                                percent: event.percentChangeFromPreviousNonEmptyWeek,
                              })
                            : t("symptomWeekChangeDown", {
                                percent: event.percentChangeFromPreviousNonEmptyWeek,
                              })}
                        </span>
                      )}
                    </p>
                    {event.categoryCounts.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {event.categoryCounts.map((c) => (
                          <li key={c.category} className="text-xs text-navy/50">
                            {tEnum(`category.${c.category}`)} · {c.count}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {(event.type === "TREATMENT_STARTED" || event.type === "TREATMENT_ENDED") && (
                  <p className="mt-1 text-sm font-medium text-navy">
                    {event.type === "TREATMENT_STARTED"
                      ? t("treatmentStarted", { name: event.name })
                      : t("treatmentEnded", { name: event.name })}
                    <span className="ml-2 text-xs font-normal text-navy/40">
                      {tEnum(`treatmentCategory.${event.category}`)}
                    </span>
                  </p>
                )}

                {event.type === "BRIEF_GENERATED" && (
                  <div className="mt-1">
                    <p className="text-sm font-medium text-navy">{t("briefGenerated")}</p>
                    <p className="mt-0.5 text-sm text-navy/60">
                      {t("briefGeneratedRange", { fromDate: event.fromDate, toDate: event.toDate })}
                    </p>
                    <Link
                      href="/brief"
                      className="mt-1 inline-block text-xs font-medium text-teal underline underline-offset-2"
                    >
                      {t("viewBrief")}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
