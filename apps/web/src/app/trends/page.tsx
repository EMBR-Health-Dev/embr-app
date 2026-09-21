"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CycleLengthEntryDto, EvidenceStrength, SymptomFrequencyDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";
import { AppNav } from "../../components/app-nav";
import { SectionLabel } from "../../components/section-label";
import { CoOccurrenceCard } from "../../components/co-occurrence-card";
import { EvidenceStrengthBadge } from "../../components/evidence-strength-badge";

const WINDOW_DAYS = 90;
const CYCLE_WINDOW_DAYS = 180;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
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
  const [dataLoading, setDataLoading] = useState(true);
  const [managesOrg, setManagesOrg] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // Same reachability reasoning as dashboard/page.tsx's identical
  // check — an org admin navigating straight to Patterns shouldn't
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
      api.trends.symptomFrequency({ from: daysAgoIso(WINDOW_DAYS) }),
      api.trends.cycleLength({ from: daysAgoIso(CYCLE_WINDOW_DAYS) }),
      api.trends.evidenceStrength(),
    ])
      .then(([symptomFrequency, cycleLength, evidenceStrengthResult]) => {
        setFrequency(symptomFrequency);
        setLengths(cycleLength.lengths);
        setAverageCycleLength(cycleLength.averageDays);
        setEvidenceStrength(evidenceStrengthResult.strength);
      })
      .finally(() => setDataLoading(false));
  }, [user]);

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
        <p className="mt-3 text-sm text-foreground/60">{t("subtitle")}</p>
        {evidenceStrength && <EvidenceStrengthBadge strength={evidenceStrength} />}

        {dataLoading ? (
          <p className="mt-8 text-sm text-foreground/50">{tCommon("loading")}</p>
        ) : (
          <>
            <section className="mt-10">
              <SectionLabel>{t("reportedDataLabel")}</SectionLabel>
              <p className="mt-2 text-sm text-foreground/60">{t("reportedDataDescription")}</p>
              <h2 className="mt-4 font-display text-heading-m text-foreground">
                {t("symptomsHeader", { days: WINDOW_DAYS })}
              </h2>
              {frequency.length === 0 ? (
                <>
                  <p className="mt-3 text-sm font-medium text-foreground">{t("noSymptomsYet")}</p>
                  <p className="mt-1 text-sm text-foreground/60">{t("noSymptomsBody")}</p>
                </>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {frequency.map(({ category, count }) => (
                    <li key={category} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 text-foreground">
                        {tEnum(`category.${category}`)}
                      </span>
                      <div className="h-2.5 flex-1 rounded-full bg-muted">
                        <div
                          className="h-2.5 rounded-full bg-primary"
                          style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                        />
                      </div>
                      <span className="w-6 text-right text-foreground/50">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <CoOccurrenceCard
              from={daysAgoIso(WINDOW_DAYS)}
              frequency={frequency}
              windowDays={WINDOW_DAYS}
            />

            <section className="mt-10">
              <SectionLabel>{t("cycleHistoryLabel")}</SectionLabel>
              <p className="mt-2 text-sm text-foreground/60">{t("cycleHistoryDescription")}</p>
              <h2 className="mt-4 font-display text-heading-m text-foreground">
                {t("cycleLengthHeader", { days: CYCLE_WINDOW_DAYS })}
              </h2>
              {lengths.length === 0 ? (
                <>
                  <p className="mt-3 text-sm text-foreground/60">{t("noCycleDataYet")}</p>
                  <p className="mt-1 text-xs text-foreground/40">{t("noCycleDataCaveat")}</p>
                </>
              ) : (
                <>
                  {averageCycleLength !== null && (
                    <p className="mt-3 text-sm text-foreground/70">
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
                      <li key={l.to} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="text-foreground/60">
                          {l.from} → {l.to}
                        </span>
                        <span className="font-medium text-foreground">
                          {l.days} {t("daysUnit")}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-foreground/40">{t("irregularityNote")}</p>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
