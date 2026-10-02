"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CycleLengthEntryDto, EvidenceStrength, SymptomFrequencyDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { SectionLabel } from "../../components/section-label";
import { CoOccurrenceCard } from "../../components/co-occurrence-card";
import { ContextCoOccurrenceCard } from "../../components/context-co-occurrence-card";
import { EvidenceStrengthBadge } from "../../components/evidence-strength-badge";
import { HistoryRangeSwitch } from "../../components/history-range-switch";
import {
  daysAgoIsoDate,
  daysSince,
  fetchRecordSpan,
  rangeStartDate,
  type HistoryRange,
} from "../../lib/record-history";

// Cycle length needs several period starts to say anything, so the
// default 90-day view reads cycles over a longer 180 days; the wider
// ranges use the range itself.
const DEFAULT_CYCLE_WINDOW_DAYS = 180;

function startOfDayIso(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toISOString();
}

export default function TrendsPage() {
  const t = useTranslations("Trends");
  const tEnum = useTranslations("Enums");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [frequency, setFrequency] = useState<SymptomFrequencyDto[]>([]);
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
    ])
      .then(([symptomFrequency, cycleLength, evidenceStrengthResult]) => {
        setFrequency(symptomFrequency);
        setLengths(cycleLength.lengths);
        setAverageCycleLength(cycleLength.averageDays);
        setEvidenceStrength(evidenceStrengthResult.strength);
        setRecordedDays(evidenceStrengthResult.distinctDaysLogged);
      })
      .finally(() => setDataLoading(false));
  }, [user, rangeStart, cycleStart, awaitingRecordStart]);

  const maxCount = frequency[0]?.count ?? 1;

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
                    {t("reportedDataDescription")}
                  </p>
                  <h2 className="mt-4 font-display text-heading-m text-foreground">
                    {range === "all"
                      ? t("symptomsHeaderAll")
                      : t("symptomsHeader", { days: windowDays })}
                  </h2>
                  {frequency.length === 0 ? (
                    <>
                      <p className="mt-3 text-body-s font-medium text-foreground">
                        {t("noSymptomsYet")}
                      </p>
                      <p className="mt-1 text-body-s text-foreground/60">{t("noSymptomsBody")}</p>
                    </>
                  ) : (
                    <ul className="mt-4 flex flex-col gap-3">
                      {frequency.map(({ category, count }) => (
                        <li key={category} className="flex items-center gap-3 text-body-s">
                          <span className="w-36 shrink-0 text-foreground">
                            {tEnum(`category.${category}`)}
                          </span>
                          <div className="h-2.5 flex-1 rounded-full bg-muted">
                            <div
                              className="h-2.5 rounded-full bg-primary"
                              style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                            />
                          </div>
                          <span className="w-6 text-right font-mono text-foreground/50 tabular-nums">
                            {count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
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
                          <li
                            key={l.to}
                            className="flex items-center justify-between py-2.5 text-body-s"
                          >
                            <span className="text-foreground/60">
                              {l.from} → {l.to}
                            </span>
                            <span className="font-medium text-foreground">
                              <span className="font-mono tabular-nums">{l.days}</span>{" "}
                              {t("daysUnit")}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 text-caption text-foreground/40">
                        {t("irregularityNote")}
                      </p>
                    </>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
