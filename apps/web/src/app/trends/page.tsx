"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CycleEntryDto, SymptomLogDto } from "@embr/types";
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

function symptomFrequency(logs: SymptomLogDto[]): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.category, (counts.get(log.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function cycleLengths(entries: CycleEntryDto[]): Array<{ from: string; to: string; days: number }> {
  const starts = entries
    .filter((e) => e.isPeriodStart)
    .map((e) => e.date)
    .sort();
  const lengths: Array<{ from: string; to: string; days: number }> = [];
  for (let i = 1; i < starts.length; i++) {
    const prev = new Date(starts[i - 1]);
    const curr = new Date(starts[i]);
    const days = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    lengths.push({ from: starts[i - 1], to: starts[i], days });
  }
  return lengths;
}

export default function TrendsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [logs, setLogs] = useState<SymptomLogDto[]>([]);
  const [entries, setEntries] = useState<CycleEntryDto[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    Promise.all([
      api.symptomLogs.list({ pageSize: 100, from: daysAgoIso(WINDOW_DAYS) }),
      api.cycleEntries.list({ pageSize: 100, from: daysAgoIso(CYCLE_WINDOW_DAYS) }),
    ])
      .then(([logsPage, entriesPage]) => {
        setLogs(logsPage.items);
        setEntries(entriesPage.items);
      })
      .finally(() => setDataLoading(false));
  }, [user]);

  const frequency = useMemo(() => symptomFrequency(logs), [logs]);
  const lengths = useMemo(() => cycleLengths(entries), [entries]);
  const maxCount = frequency[0]?.count ?? 1;
  const averageCycleLength =
    lengths.length > 0
      ? Math.round(lengths.reduce((sum, l) => sum + l.days, 0) / lengths.length)
      : null;

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
