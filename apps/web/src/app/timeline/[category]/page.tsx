"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { SymptomCategory, SymptomHistoryDto, SymptomLogDto } from "@embr/types";
import { symptomCategorySchema } from "@embr/validation";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api";
import { AppNav } from "../../../components/app-nav";
import { SectionLabel } from "../../../components/section-label";
import { HistoryRangeSwitch } from "../../../components/history-range-switch";
import { SymptomCalendar } from "../../../components/symptom-calendar";
import { toIsoDate } from "../../../lib/date-format";
import { rangeStartDate, type HistoryRange } from "../../../lib/record-history";
import {
  FREQUENCY_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  browserTimeZone,
  dayEvidence,
  findCategory,
  symptomRecordState,
} from "../../../lib/symptom-evidence";
import { formatHistoryDate } from "../../../lib/symptom-history-format";
import { richText } from "../../../lib/rich-text";

/**
 * One symptom's history: when it was first and last logged, how often
 * over fixed windows, and a calendar of the days with an entry. Every
 * figure comes from GET /trends/symptom-history; this page adds no
 * interpretation.
 */
export default function SymptomHistoryPage() {
  const t = useTranslations("SymptomHistory");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ category: string }>();
  const { user, loading, logout } = useAuth();

  const parsed = symptomCategorySchema.safeParse(params.category);
  const category: SymptomCategory | null = parsed.success ? parsed.data : null;

  const [managesOrg, setManagesOrg] = useState(false);
  const [range, setRange] = useState<HistoryRange>("90d");
  const [history, setHistory] = useState<SymptomHistoryDto | null>(null);
  // The whole-record start for "Full record": known after the first load.
  const [firstLoggedOn, setFirstLoggedOn] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayLogs, setDayLogs] = useState<SymptomLogDto[] | null>(null);
  const dayDetailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  const today = toIsoDate(new Date());
  const from = range === "all" ? firstLoggedOn : rangeStartDate(range, null);

  useEffect(() => {
    // Same fetch-on-change pattern (and suppression) as timeline/page.tsx.
    if (!user || !category || !from) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    setLoadError(false);
    api.trends
      .symptomHistory({ from, to: today, timeZone: browserTimeZone() })
      .then((result) => {
        setHistory(result);
        const first = findCategory(result, category)?.firstLoggedOn;
        if (first) setFirstLoggedOn(first);
      })
      .catch(() => setLoadError(true))
      .finally(() => setDataLoading(false));
  }, [user, category, from, today]);

  const symptom = category ? findCategory(history, category) : undefined;
  const selectedEvidence = selectedDate ? dayEvidence(symptom, selectedDate) : null;
  const selectedState = selectedEvidence?.state ?? null;

  // A logged day's entries (with notes) are read only when it is opened.
  useEffect(() => {
    if (!category || !selectedDate || selectedState !== "logged") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayLogs(null);
    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(end.getMilliseconds() - 1);
    api.symptomLogs
      .list({ category, from: start.toISOString(), to: end.toISOString(), pageSize: 100 })
      .then((page) =>
        setDayLogs([...page.items].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))),
      )
      .catch(() => setDayLogs([]));
  }, [category, selectedDate, selectedState]);

  // Bring the opened day into view (it sits under its own month).
  useEffect(() => {
    if (selectedDate) dayDetailRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedDate]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  const symptomName = category ? tEnum(`category.${category}`) : t("sectionTitle");
  const state = symptomRecordState(symptom);
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });

  const dayDetail =
    selectedEvidence && selectedDate ? (
      <div aria-live="polite">
        <section
          ref={dayDetailRef}
          className="mt-2 rounded-lg border border-border-subtle bg-background p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-medium text-foreground">
              {formatHistoryDate(locale, selectedDate)}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              {t("closeDay")}
            </button>
          </div>
          {selectedEvidence.state === "no_entry" ? (
            <p className="mt-2 text-sm text-foreground/70">{t.rich("noEntryForDay", richText)}</p>
          ) : dayLogs === null ? (
            <p className="mt-2 text-sm text-foreground/50">{t("dayLoading")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {dayLogs.map((log) => (
                <li key={log.id} className="border-l-2 border-lilac-500 pl-3">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{symptomName}</span>
                    {" · "}
                    {tEnum(`severity.${log.severity}`)}
                    <span className="text-foreground/50">
                      {" · "}
                      {timeFormat.format(new Date(log.occurredAt))}
                    </span>
                  </p>
                  {log.notes && (
                    <p className="mt-1 text-sm text-foreground/70">
                      <span className="text-foreground/50">{t("note")}: </span>
                      {log.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    ) : null;

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/timeline"
          className="text-sm text-foreground/60 underline-offset-4 hover:text-foreground hover:underline"
        >
          ← {t("backToTimeline")}
        </Link>
        <h1 className="mt-4 font-display text-heading-xl text-foreground">{symptomName}</h1>

        {category && dataLoading && !history ? (
          <p className="mt-8 text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : loadError ? (
          <p role="alert" className="mt-8 text-sm text-foreground">
            {t("loadError")}
          </p>
        ) : state === "no_history" || !symptom ? (
          <div className="mt-8">
            <p className="text-sm font-medium text-foreground">{t("noHistoryTitle")}</p>
            <p className="mt-1 text-sm text-foreground/60">{t("noHistoryBody")}</p>
          </div>
        ) : (
          <>
            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-border-subtle border-t-4 border-t-lilac-600 bg-lilac-100/60 p-5 sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-foreground/60">
                  {t("firstLogged")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatHistoryDate(locale, symptom.firstLoggedOn)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-foreground/60">
                  {t("lastLogged")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {formatHistoryDate(locale, symptom.lastLoggedOn)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-foreground/60">
                  {t("recentFrequency")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-lilac-700">
                  {t("daysOfLast", { count: symptom.daysLoggedLast7, total: RECENT_WINDOW_DAYS })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.1em] text-foreground/60">
                  {t("longFrequency")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-lilac-700">
                  {t("daysOfLast", {
                    count: symptom.daysLoggedLast42,
                    total: FREQUENCY_WINDOW_DAYS,
                  })}
                </dd>
              </div>
            </dl>

            {state === "not_logged_recently" && history && (
              <div className="mt-4 rounded-lg border border-lilac-300 p-4">
                <p className="text-sm font-medium text-foreground">{t("notLoggedRecently")}</p>
                <p className="mt-1 text-sm text-foreground/80">
                  {t("notLoggedInLast", { days: history.rules.notLoggedRecentlyGapDays })}
                </p>
                <p className="mt-2 text-xs text-foreground/50">
                  {t("notLoggedRecentlyRule", {
                    days: history.rules.notLoggedRecentlyGapDays,
                    min: history.rules.notLoggedRecentlyMinDays,
                  })}
                </p>
              </div>
            )}

            <div className="mt-10">
              <SectionLabel>{t("calendarTitle")}</SectionLabel>
              <HistoryRangeSwitch value={range} onChange={setRange} disabled={dataLoading} />
              {history && (
                <div className="mt-6">
                  <SymptomCalendar
                    history={symptom}
                    symptomName={symptomName}
                    from={history.rangeFrom}
                    to={history.rangeTo}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    dayDetail={dayDetail}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
