"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  ContextLogDto,
  CycleEntryDto,
  NightSweatsRecall,
  SymptomHistoryDto,
  SymptomLogDto,
  TreatmentDto,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { SectionLabel } from "../../components/section-label";
import { toIsoDate } from "../../lib/date-format";
import { HistoryRangeSwitch } from "../../components/history-range-switch";
import { RecordSpanSummary } from "../../components/record-span-summary";
import { SymptomEvidenceCard } from "../../components/symptom-evidence-card";
import { SymptomRankingBars } from "../../components/symptom-ranking-bars";
import { TimelineMonth } from "../../components/timeline-month";
import { browserTimeZone } from "../../lib/symptom-evidence";
import {
  daysSince,
  fetchRecordSpan,
  rangeStartDate,
  type HistoryRange,
  type RecordSpan,
} from "../../lib/record-history";
import { richText } from "../../lib/rich-text";
import { formatHistoryDate } from "../../lib/symptom-history-format";

// The list endpoints cap a page at 100 items; a long record is read page
// by page up to this many pages per source (1,000 entries), and the page
// says so if anything older was left out.
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(page);
    items.push(...result.items);
    if (items.length >= result.total || result.items.length === 0) {
      return { items, truncated: false };
    }
  }
  return { items, truncated: true };
}

type FilterKey = "symptoms" | "cycle" | "treatments";
const FILTER_KEYS: FilterKey[] = ["symptoms", "cycle", "treatments"];

interface DayGroup {
  date: string; // YYYY-MM-DD
  symptoms: SymptomLogDto[];
  cycle: CycleEntryDto | null;
  // Recalled the next morning; shown beside symptoms, never counted as one.
  nightSweats: NightSweatsRecall | null;
  treatmentEvents: Array<{ treatment: TreatmentDto; kind: "started" | "ended" }>;
}

export default function TimelinePage() {
  const t = useTranslations("Timeline");
  const tEnum = useTranslations("Enums");
  const tHistory = useTranslations("SymptomHistory");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [symptomLogs, setSymptomLogs] = useState<SymptomLogDto[]>([]);
  const [cycleEntries, setCycleEntries] = useState<CycleEntryDto[]>([]);
  const [treatments, setTreatments] = useState<TreatmentDto[]>([]);
  const [contextLogs, setContextLogs] = useState<ContextLogDto[]>([]);
  // True if any source had more than MAX_PAGES pages in range: the page
  // must say so rather than silently showing a partial record.
  const [truncated, setTruncated] = useState(false);
  const [range, setRange] = useState<HistoryRange>("90d");
  const [recordSpan, setRecordSpan] = useState<RecordSpan | null>(null);
  const [symptomHistory, setSymptomHistory] = useState<SymptomHistoryDto | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [managesOrg, setManagesOrg] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(() => new Set(FILTER_KEYS));
  const [view, setView] = useState<"list" | "month">("list");
  const [month, setMonth] = useState(() => toIsoDate(new Date()).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  // /timeline?range=all (the dashboard's "See your full timeline")
  // opens straight onto the full record. Read once on mount rather than
  // through useSearchParams, which would need a Suspense boundary here.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("range");
    if (requested === "all" || requested === "12m") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRange(requested);
    }
  }, []);

  // Per-symptom evidence cards: whole-record figures, independent of
  // the range below, so fetched once.
  useEffect(() => {
    if (!user) return;
    api.trends
      .symptomHistory({ timeZone: browserTimeZone() })
      .then(setSymptomHistory)
      .catch(() => setSymptomHistory(null));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchRecordSpan()
      .then(setRecordSpan)
      .catch(() => setRecordSpan(null));
  }, [user]);

  // Depends on the start date itself, not on recordSpan: the span
  // arriving must not refetch (and flash) a view that doesn't use it.
  const awaitingRecordStart = range === "all" && !recordSpan;
  const fetchStart = rangeStartDate(range, recordSpan?.start ?? null);

  useEffect(() => {
    // Matches React's own documented fetch-on-mount pattern — same
    // suppression reasoning as trends/page.tsx and dashboard/page.tsx.
    if (!user) return;
    // "Full record" needs the record's start date first.
    if (awaitingRecordStart) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    const from = new Date(`${fetchStart}T00:00:00`).toISOString();

    Promise.all([
      fetchAllPages((page) => api.symptomLogs.list({ from, page, pageSize: PAGE_SIZE })),
      fetchAllPages((page) => api.cycleEntries.list({ from, page, pageSize: PAGE_SIZE })),
      // Treatments has no from/to range filter (it's built for "what am
      // I on right now," not chronological listing — see
      // apps/api/src/modules/treatments/treatment.routes.ts) — fetched
      // in full and filtered to this window client-side below.
      fetchAllPages((page) => api.treatments.list({ page, pageSize: PAGE_SIZE })),
      fetchAllPages((page) =>
        api.contextLogs.list({ from: fetchStart, page, pageSize: PAGE_SIZE }),
      ),
    ])
      .then(([symptomsResult, cycleResult, treatmentsResult, contextResult]) => {
        setSymptomLogs(symptomsResult.items);
        setCycleEntries(cycleResult.items);
        setTreatments(treatmentsResult.items);
        setContextLogs(contextResult.items);
        setTruncated(
          symptomsResult.truncated ||
            cycleResult.truncated ||
            treatmentsResult.truncated ||
            contextResult.truncated,
        );
      })
      .finally(() => setDataLoading(false));
  }, [user, fetchStart, awaitingRecordStart]);

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

  const windowStart = rangeStartDate(range, recordSpan?.start ?? null);
  const groups = new Map<string, DayGroup>();

  function getGroup(date: string): DayGroup {
    let group = groups.get(date);
    if (!group) {
      group = { date, symptoms: [], cycle: null, nightSweats: null, treatmentEvents: [] };
      groups.set(date, group);
    }
    return group;
  }

  for (const log of symptomLogs) {
    getGroup(toIsoDate(new Date(log.occurredAt))).symptoms.push(log);
  }
  for (const entry of cycleEntries) {
    getGroup(entry.date).cycle = entry;
  }
  for (const log of contextLogs) {
    if (log.nightSweats) getGroup(log.date).nightSweats = log.nightSweats;
  }
  for (const treatment of treatments) {
    if (treatment.startDate >= windowStart) {
      getGroup(treatment.startDate).treatmentEvents.push({ treatment, kind: "started" });
    }
    if (treatment.endDate && treatment.endDate >= windowStart) {
      getGroup(treatment.endDate).treatmentEvents.push({ treatment, kind: "ended" });
    }
  }

  const sortedDates = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

  function toggleFilter(key: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const visibleDates = sortedDates.filter((date) => {
    const group = groups.get(date)!;
    return (
      (activeFilters.has("symptoms") && (group.symptoms.length > 0 || group.nightSweats)) ||
      (activeFilters.has("cycle") && group.cycle !== null) ||
      (activeFilters.has("treatments") && group.treatmentEvents.length > 0)
    );
  });

  function renderDayEntries(group: DayGroup) {
    const categories = [...new Set(group.symptoms.map((s) => tEnum(`category.${s.category}`)))];
    return (
      <div className="flex flex-col gap-2">
        {activeFilters.has("symptoms") && categories.length > 0 && (
          <p className="text-sm text-foreground">{categories.join(" · ")}</p>
        )}
        {activeFilters.has("symptoms") && group.nightSweats && (
          <p className="text-sm text-foreground/70">
            {t("nightSweatsRecalled", {
              value: tEnum(`nightSweats.${group.nightSweats}`),
            })}
          </p>
        )}
        {activeFilters.has("cycle") && group.cycle && (
          <p className="text-sm text-foreground/70">
            {t("cycleLabel")}
            {": "}
            {[
              group.cycle.flow ? tEnum(`flow.${group.cycle.flow}`) : null,
              group.cycle.isPeriodStart ? t("periodStarted") : null,
              group.cycle.isPeriodEnd ? t("periodEnded") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {activeFilters.has("treatments") &&
          group.treatmentEvents.map(({ treatment, kind }) => (
            <p key={`${treatment.id}-${kind}`} className="text-sm text-foreground/70">
              {kind === "started"
                ? t("treatmentStarted", { name: treatment.name })
                : t("treatmentEnded", { name: treatment.name })}
            </p>
          ))}
      </div>
    );
  }

  function marksFor(date: string) {
    const group = groups.get(date);
    if (!group) return null;
    const marks = {
      symptoms:
        activeFilters.has("symptoms") && (group.symptoms.length > 0 || group.nightSweats !== null),
      cycle: activeFilters.has("cycle") && group.cycle !== null,
      treatments: activeFilters.has("treatments") && group.treatmentEvents.length > 0,
    };
    return marks.symptoms || marks.cycle || marks.treatments ? marks : null;
  }

  const currentYear = new Date().getFullYear();
  function formatDateHeading(date: string): string {
    const d = new Date(`${date}T00:00:00`);
    // The year only appears once history reaches back past this year.
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      ...(d.getFullYear() !== currentYear ? { year: "numeric" } : {}),
    }).format(d);
  }
  function formatMonthHeading(date: string): string {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
      new Date(`${date}T00:00:00`),
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 text-sm text-foreground/60">{t("subtitle")}</p>
        {recordSpan && <RecordSpanSummary span={recordSpan} />}

        {symptomHistory && symptomHistory.categories.length > 0 && (
          <section className="mt-10" aria-labelledby="symptom-history-heading">
            <h2
              id="symptom-history-heading"
              className="font-display text-heading-m text-foreground"
            >
              {tHistory("sectionTitle")}
            </h2>
            <p className="mt-2 text-sm text-foreground/60">
              {tHistory.rich("sectionIntro", richText)}
            </p>
            <SymptomRankingBars
              categories={symptomHistory.categories}
              rangeFrom={formatHistoryDate(locale, symptomHistory.rangeFrom)}
              rangeTo={formatHistoryDate(locale, symptomHistory.rangeTo)}
            />
            <ul className="mt-5 border-b border-border-subtle">
              {symptomHistory.categories.map((category) => (
                <SymptomEvidenceCard
                  key={category.category}
                  history={category}
                  gapDays={symptomHistory.rules.notLoggedRecentlyGapDays}
                />
              ))}
            </ul>
          </section>
        )}

        <HistoryRangeSwitch value={range} onChange={setRange} disabled={dataLoading} />

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("filterGroupLabel")}>
          {FILTER_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleFilter(key)}
              aria-pressed={activeFilters.has(key)}
              className={`rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilters.has(key)
                  ? "border-lilac-700 bg-lilac-100 text-foreground"
                  : "border-border text-foreground/50"
              }`}
            >
              {t(`filter.${key}`)}
            </button>
          ))}
        </div>

        <div
          className="mt-3 inline-flex rounded-sm border border-border p-0.5"
          role="group"
          aria-label={t("viewLabel")}
        >
          {(["list", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium ${
                view === v ? "bg-foreground text-background" : "text-foreground/70"
              }`}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <p className="mt-8 text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : view === "month" ? (
          <TimelineMonth
            from={windowStart}
            to={toIsoDate(new Date())}
            month={month}
            onMonthChange={(m) => {
              setMonth(m);
              setSelectedDay(null);
            }}
            marksFor={marksFor}
            selectedDate={selectedDay}
            onSelectDate={setSelectedDay}
            dayDetail={
              selectedDay && groups.get(selectedDay)
                ? renderDayEntries(groups.get(selectedDay)!)
                : null
            }
          />
        ) : visibleDates.length === 0 ? (
          <div className="mt-10">
            <p className="text-sm font-medium text-foreground">
              {sortedDates.length === 0 ? t("emptyTitle") : t("filteredEmptyTitle")}
            </p>
            <p className="mt-1 text-sm text-foreground/60">
              {sortedDates.length === 0 ? t("emptyBody") : t("filteredEmptyBody")}
            </p>
          </div>
        ) : (
          <ul className="mt-10 flex flex-col gap-8">
            {visibleDates.map((date, index) => {
              const group = groups.get(date)!;
              // A month marker wherever the month changes, so a long
              // record reads as history rather than one undifferentiated list.
              const newMonth =
                index === 0 || visibleDates[index - 1]!.slice(0, 7) !== date.slice(0, 7);
              return (
                <li key={date}>
                  {newMonth && (
                    <h2 className="mb-4 font-display text-heading-m text-lilac-700">
                      {formatMonthHeading(date)}
                    </h2>
                  )}
                  <SectionLabel as="h3">{formatDateHeading(date)}</SectionLabel>
                  <div className="mt-3 border-l border-border-subtle pl-4">
                    {renderDayEntries(group)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!dataLoading && truncated && (
          <p className="mt-10 text-xs text-foreground/40">
            {range === "all"
              ? t("truncatedNoticeAll")
              : t("truncatedNotice", { days: daysSince(windowStart) - 1 })}
          </p>
        )}
      </main>
    </div>
  );
}
