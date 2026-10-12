"use client";

import type { AdminMetricsDto } from "@embr/types";
import { formatRate, formatWeek, ofTotal } from "../lib/metrics-format";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border p-4">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-foreground/60">
        {label}
      </span>
      <span className="font-display text-3xl tabular-nums text-foreground">{value}</span>
      {note && <span className="text-sm text-foreground/60">{note}</span>}
    </div>
  );
}

/**
 * Counts only: how many people signed up, logged and used a BRIEF.
 * Never health content, never one person (see the API's admin.metrics.ts).
 */
export function MetricsPanel({ metrics }: { metrics: AdminMetricsDto }) {
  const { accounts, activity, retentionWeek4, briefs, weekly } = metrics;

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="metrics-people">
        <h2 id="metrics-people" className="text-sm font-medium text-foreground/70">
          People
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Accounts" value={accounts.total.toLocaleString()} />
          <Tile label="Verified" value={ofTotal(accounts.verified, accounts.total)} />
          <Tile label="Finished onboarding" value={ofTotal(accounts.onboarded, accounts.total)} />
          <Tile
            label="New"
            value={accounts.new7d.toLocaleString()}
            note={`last 7 days · ${accounts.new30d} in 30`}
          />
        </div>
      </section>

      <section aria-labelledby="metrics-use">
        <h2 id="metrics-use" className="text-sm font-medium text-foreground/70">
          Logging
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Active, 7 days" value={activity.active7d.toLocaleString()} />
          <Tile label="Active, 30 days" value={activity.active30d.toLocaleString()} />
          <Tile
            label="Days logged"
            value={activity.avgDaysLogged7d === null ? "—" : String(activity.avgDaysLogged7d)}
            note="per active person, last 7 days"
          />
          <Tile
            label="Week 4 retention"
            value={formatRate(retentionWeek4.rate)}
            note={`${ofTotal(retentionWeek4.retained, retentionWeek4.cohort)} signed up 4 to 8 weeks ago`}
          />
        </div>
      </section>

      <section aria-labelledby="metrics-briefs">
        <h2 id="metrics-briefs" className="text-sm font-medium text-foreground/70">
          BRIEFs
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Created, 7 days" value={briefs.generated7d.toLocaleString()} />
          <Tile label="Created, 30 days" value={briefs.generated30d.toLocaleString()} />
          <Tile label="Downloaded, 30 days" value={briefs.downloaded30d.toLocaleString()} />
          <Tile label="People with a BRIEF" value={briefs.peopleWithBrief.toLocaleString()} />
        </div>
      </section>

      <section aria-labelledby="metrics-weekly">
        <h2 id="metrics-weekly" className="text-sm font-medium text-foreground/70">
          Last 8 weeks
        </h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-foreground/60">
              <th scope="col" className="pb-2 font-medium">
                Week of
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Active people
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                New accounts
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                BRIEFs created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {weekly.map((w) => (
              <tr key={w.weekStart}>
                <th scope="row" className="py-2.5 font-normal text-foreground">
                  {formatWeek(w.weekStart)}
                </th>
                <td className="py-2.5 text-right tabular-nums text-foreground">{w.activePeople}</td>
                <td className="py-2.5 text-right tabular-nums text-foreground">{w.newAccounts}</td>
                <td className="py-2.5 text-right tabular-nums text-foreground">
                  {w.briefsGenerated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-foreground/60">
        Counts only. No health content, no individual people, admin accounts excluded. Updated{" "}
        {new Date(metrics.generatedAt).toLocaleString()}. Dates in UTC.
      </p>
    </div>
  );
}
