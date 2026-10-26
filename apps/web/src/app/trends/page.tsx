"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type {
  CycleLengthEntryDto,
  EvidenceStrength,
  SymptomFrequencyDto,
  SymptomHistoryDto,
} from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { SectionLabel } from "../../components/section-label";
import { CoOccurrenceCard } from "../../components/co-occurrence-card";
import { ContextCoOccurrenceCard } from "../../components/context-co-occurrence-card";
import { EvidenceStrengthBadge } from "../../components/evidence-strength-badge";
import { HistoryRangeSwitch } from "../../components/history-range-switch";
import { SymptomTrendList } from "../../components/symptom-trend-list";
import {
  daysAgoIsoDate,
  daysSince,
  fetchRecordSpan,
  rangeStartDate,
  type HistoryRange,
} from "../../lib/record-history";
import { richText } from "../../lib/rich-text";
import { isPostmenopause, useLifeStage } from "../../lib/life-stage";
import { browserTimeZone } from "../../lib/symptom-evidence";
import { toIsoDate } from "../../lib/date-format";
import { formatHistoryDate } from "../../lib/symptom-history-format";

// Cycle length needs several period starts to say anything, so the
// default 90-day view reads cycles over a longer 180 days; the wider
// ranges use the range itself.
const DEFAULT_CYCLE_WINDOW_DAYS = 180;

function startOfDayIso(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toISOString();
}

export default function TrendsPage() {
  const t = useTranslations("Trends");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const postmenopause = isPostmenopause(useLifeStage(Boolean(user)));

  const [frequency, setFrequency] = useState<SymptomFrequencyDto[]>([]);
  const [history, setHistory] = useState<SymptomHistoryDto | null>(null);
  const [lengths, setLengths] = useState<CycleLengthEntryDto[]>([]);
  const [averageCycleLength, setAverageCycleLength] = useState<number | null>(null);
  const [evidenceStrength, setEvidenceStrength] = useState<EvidenceStrength | null>(null);
  // Days with any entry across the whole record; 0 means nothing recorded yet.
  const [recordedDays, setRecordedDays] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [managesOrg, setManagesOrg] = useState(false);
  const [range, setRange] = useState<HistoryRange>("90d");
  const [recordStart, setRecordStart] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    fetchRecordSpan()
      .then((span) => setRecordStart(span.start))
      .catch(() => setRecordStart(null));
  }, [user]);

  const awaitingRecordStart = range === "all" && recordStart === undefined;
  const rangeStart = rangeStartDate(range, recordStart ?? null);
  const windowDays = daysSince(rangeStart) - 1;
  const cycleStart = range === "90d" ? daysAgoIsoDate(DEFAULT_CYCLE_WINDOW_DAYS) : rangeStart;

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Same reachability reasoning as dashboard/page.tsx's identical
  // check — an org admin navigating straight to Signals shouldn't
  // lose the Organization link just because they didn't start at the
  // dashboard.
  useEffect(() => {
    if (!user) return;
    api.organizations
      .mine()
      .then((rows) => setManagesOrg(rows.some((m) => m.role === "ORG_ADMIN")))
      .catch(() => setManagesOrg(false));
  }, [user]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  useEffect(() => {
    if (!user) return;
    if (awaitingRecordStart) return;
    // Matches React's own documented data-fetching-in-effect pattern
    // (react.dev/learn/synchronizing-with-effects#fetching-data);
    // react-hooks/set-state-in-effect flags it anyway. Same reasoning
    // as the equivalent suppression in apps/admin/dashboard/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDataLoading(true);
    // Both trends are now computed server-side (Milestone 9) — Postgres
    // does the GROUP BY / diffing over the full range, so this view is
    // no longer subject to the pageSize:100 cap the old client-side
    // aggregation had (see Milestone 5's known limitation).
    Promise.all([
      api.trends.symptomFrequency({ from: startOfDayIso(rangeStart) }),
      api.trends.cycleLength({ from: startOfDayIso(cycleStart) }),
      api.trends.evidenceStrength(),
      // Days per symptom, in her own time zone, for the per-symptom
      // rows; the entry counts above still feed the co-occurrence card.
      api.trends.symptomHistory({
        from: rangeStart,
        to: toIsoDate(new Date()),
        timeZone: browserTimeZone(),
      }),
    ])
      .then(([symptomFrequency, cycleLength, evidenceStrengthResult, symptomHistory]) => {
        setFrequency(symptomFrequency);
        setHistory(symptomHistory);
        setLengths(cycleLength.lengths);
        setAverageCycleLength(cycleLength.averageDays);
        setEvidenceStrength(evidenceStrengthResult.strength);
        setRecordedDays(evidenceStrengthResult.distinctDaysLogged);
      })
      .finally(() => setDataLoading(false));
  }, [user, rangeStart, cycleStart, awaitingRecordStart]);

  const longestCycle = Math.max(1, ...lengths.map((l) => l.days));

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-foreground/50">{tCommon("loading")}</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <AppNav userEmail={user.email} managesOrg={managesOrg} onLogout={() => void handleLogout()} />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-heading-xl text-foreground">{t("title")}</h1>
        <p className="mt-3 text-body-s text-foreground/60">{t("subtitle")}</p>
        {recordedDays === 0 ? (
          // Nothing recorded at all: one explanation and one next step,
          // rather than a badge, a range switch and three empty sections.
          <div className="mt-10 border-t border-border-subtle pt-8">
            <p className="font-medium text-foreground">{t("emptyRecordTitle")}</p>
            <p className="mt-2 max-w-prose text-body-s text-foreground/70">
              {t("emptyRecordBody")}
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex min-h-11 items-center rounded-sm bg-foreground px-5 text-sm font-medium text-background hover:bg-graphite-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("emptyRecordAction")}
            </Link>
          </div>
        ) : (
          <>
            {evidenceStrength && <EvidenceStrengthBadge strength={evidenceStrength} />}

            <HistoryRangeSwitch value={range} onChange={setRange} disabled={dataLoading} />

            {dataLoading ? (
              <p className="mt-8 text-body-s text-foreground/50">{tCommon("loading")}</p>
            ) : (
              <>
                <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-6">
                  <SectionLabel>{t("reportedDataLabel")}</SectionLabel>
                  <p className="mt-2 text-body-s text-foreground/60">
                    {t.rich("reportedDataDescription", richText)}
                  </p>
                  <h2 className="mt-4 font-display text-heading-m text-foreground">
                    {range === "all"
                      ? t("symptomsHeaderAll")
                      : t("symptomsHeader", { days: windowDays })}
                  </h2>
                  <SymptomTrendList
                    categories={history?.categories ?? []}
                    from={history?.rangeFrom ?? rangeStart}
                    to={history?.rangeTo ?? rangeStart}
                  />
                </section>

                <CoOccurrenceCard
                  key={`co-${rangeStart}`}
                  from={startOfDayIso(rangeStart)}
                  frequency={frequency}
                  windowDays={windowDays}
                />

                <ContextCoOccurrenceCard
                  key={`ctx-${rangeStart}`}
                  from={startOfDayIso(rangeStart)}
                />

                {/* Cycle lengths mean nothing after menopause, so the
                    section is hidden for her. */}
                {!postmenopause && (
                  <section className="mt-8 rounded-lg border border-border-subtle bg-surface p-6">
                    <SectionLabel>{t("cycleHistoryLabel")}</SectionLabel>
                    <p className="mt-2 text-body-s text-foreground/60">
                      {t("cycleHistoryDescription")}
                    </p>
                    <h2 className="mt-4 font-display text-heading-m text-foreground">
                      {range === "all"
                        ? t("cycleLengthHeaderAll")
                        : t("cycleLengthHeader", { days: daysSince(cycleStart) - 1 })}
                    </h2>
                    {lengths.length === 0 ? (
                      <>
                        <p className="mt-3 text-body-s text-foreground/60">{t("noCycleDataYet")}</p>
                        <p className="mt-1 text-caption text-foreground/40">
                          {t("noCycleDataCaveat")}
                        </p>
                      </>
                    ) : (
                      <>
                        {averageCycleLength !== null && (
                          <p className="mt-3 text-body-s text-foreground/70">
                            {t.rich("averagingDays", {
                              days: averageCycleLength,
                              strong: (chunks) => (
                                <span className="font-medium text-foreground">{chunks}</span>
                              ),
                            })}
                          </p>
                        )}
                        <ul className="mt-4 divide-y divide-border-subtle">
                          {lengths.map((l) => (
                            <li key={l.to} className="py-3 text-body-s">
                              <div className="flex items-baseline justify-between gap-4">
                                <span className="text-foreground/70">
                                  {t("cycleRange", {
                                    from: formatHistoryDate(locale, l.from),
                                    to: formatHistoryDate(locale, l.to),
                                  })}
                                </span>
                                <span className="shrink-0 font-medium text-foreground">
                                  <span className="font-mono tabular-nums">{l.days}</span>{" "}
                                  {t("daysUnit")}
                                </span>
                              </div>
                              <div
                                aria-hidden="true"
                                className="mt-1.5 h-1.5 rounded-full bg-muted"
                              >
                                <div
                                  className="h-1.5 rounded-full bg-lilac-500"
                                  style={{ width: `${(l.days / longestCycle) * 100}%` }}
                                />
                              </div>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-4 text-caption text-foreground/40">
                          {t("irregularityNote")}
                        </p>
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
