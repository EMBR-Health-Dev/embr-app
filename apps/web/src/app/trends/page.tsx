"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CycleLengthEntryDto, SymptomFrequencyDto } from "@embr/types";
import { useAuth } from "../../lib/auth-context";
import { api } from "../../lib/api";

const WINDOW_DAYS = 90;
const CYCLE_WINDOW_DAYS = 180;

function categoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function TrendsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [frequency, setFrequency] = useState<SymptomFrequencyDto[]>([]);
  const [lengths, setLengths] = useState<CycleLengthEntryDto[]>([]);
  const [averageCycleLength, setAverageCycleLength] = useState<number | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
    ])
      .then(([symptomFrequency, cycleLength]) => {
        setFrequency(symptomFrequency);
        setLengths(cycleLength.lengths);
        setAverageCycleLength(cycleLength.averageDays);
      })
      .finally(() => setDataLoading(false));
  }, [user]);

  const maxCount = frequency[0]?.count ?? 1;

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-navy/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">Trends</h1>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-teal underline underline-offset-2"
        >
          ← Dashboard
        </Link>
      </header>

      {dataLoading ? (
        <p className="mt-8 text-sm text-navy/50">Loading…</p>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="font-display text-lg text-navy">Symptoms, last {WINDOW_DAYS} days</h2>
            {frequency.length === 0 ? (
              <p className="mt-3 text-sm text-navy/50">
                Nothing logged in this window yet — patterns will show up here as you go.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {frequency.map(({ category, count }) => (
                  <li key={category} className="flex items-center gap-3 text-sm">
                    <span className="w-36 shrink-0 text-navy">{categoryLabel(category)}</span>
                    <div className="h-2.5 flex-1 rounded-full bg-navy/5">
                      <div
                        className="h-2.5 rounded-full bg-brass"
                        style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-navy/50">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="font-display text-lg text-navy">
              Cycle length, last {CYCLE_WINDOW_DAYS} days
            </h2>
            {lengths.length === 0 ? (
              <p className="mt-3 text-sm text-navy/50">
                Log at least two period-start days to see cycle lengths here. Irregular or absent
                cycles are common in perimenopause — this is a record for you and your provider, not
                a diagnosis.
              </p>
            ) : (
              <>
                {averageCycleLength !== null && (
                  <p className="mt-3 text-sm text-navy/70">
                    Averaging{" "}
                    <span className="font-medium text-navy">{averageCycleLength} days</span> between
                    period starts over this window.
                  </p>
                )}
                <ul className="mt-4 divide-y divide-navy/10">
                  {lengths.map((l) => (
                    <li key={l.to} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-navy/60">
                        {l.from} → {l.to}
                      </span>
                      <span className="font-medium text-navy">{l.days} days</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-navy/40">
                  Cycle irregularity is expected during perimenopause — this view is here to help
                  you notice your own pattern, not to flag it as a problem.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
