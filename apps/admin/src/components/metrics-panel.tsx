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

const OUTCOME_LABELS: Array<[keyof AdminMetricsDto["appointmentOutcomes"]["byAnswer"], string]> = [
  ["YES_SIGNIFICANTLY", "Yes, significantly"],
  ["YES_SOMEWHAT", "Yes, somewhat"],
  ["NOT_REALLY", "Not really"],
  ["NO", "No"],
  ["NO_APPOINTMENT_YET", "No appointment yet"],
];

/**
 * Counts only: how many people signed up, logged and used a BRIEF.
 * Never health content, never one person (see the API's admin.metrics.ts).
 */
export function MetricsPanel({ metrics }: { metrics: AdminMetricsDto }) {
  const {
    accounts,
    activity,
    retentionWeek4,
    briefs,
    weekly,
    activation,
    briefAi,
    appointmentOutcomes,
  } = metrics;

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

      <section aria-labelledby="metrics-activation">
        <h2 id="metrics-activation" className="text-sm font-medium text-foreground/70">
          Activation
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="First log in 48h"
            value={formatRate(activation.firstLog48h.rate)}
            note={`${ofTotal(activation.firstLog48h.reached, activation.firstLog48h.cohort)} signed up 2 to 30 days ago`}
          />
          <Tile
            label="7 of first 14 days"
            value={formatRate(activation.sevenOfFourteen.rate)}
            note={`${ofTotal(activation.sevenOfFourteen.reached, activation.sevenOfFourteen.cohort)} signed up 2 to 8 weeks ago`}
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

      <section aria-labelledby="metrics-outcomes">
        <h2 id="metrics-outcomes" className="text-sm font-medium text-foreground/70">
          Did the BRIEF help in the appointment?
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {OUTCOME_LABELS.map(([key, label]) => (
            <Tile
              key={key}
              label={label}
              value={ofTotal(appointmentOutcomes.byAnswer[key], appointmentOutcomes.answered)}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="metrics-ai">
        <h2 id="metrics-ai" className="text-sm font-medium text-foreground/70">
          BRIEF AI wording, last 30 days
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Rejected"
            value={formatRate(briefAi.rejectionRate)}
            note={`${ofTotal(briefAi.rejected30d, briefAi.attempts30d)} attempts; saved without wording`}
          />
          <Tile
            label="Latency"
            value={
              briefAi.latencyP50Ms === null ? "—" : `${(briefAi.latencyP50Ms / 1000).toFixed(1)}s`
            }
            note={
              briefAi.latencyP95Ms === null
                ? "median"
                : `median · p95 ${(briefAi.latencyP95Ms / 1000).toFixed(1)}s`
            }
          />
          <Tile
            label="Tokens"
            value={briefAi.avgInputTokens === null ? "—" : briefAi.avgInputTokens.toLocaleString()}
            note={`in · ${briefAi.avgOutputTokens === null ? "—" : briefAi.avgOutputTokens.toLocaleString()} out, on average`}
          />
          <Tile
            label="Cost per BRIEF"
            value={
              briefAi.estimatedCostPerBriefUsd === null
                ? "—"
                : `$${briefAi.estimatedCostPerBriefUsd.toFixed(4)}`
            }
            note={
              briefAi.estimatedCostPerBriefUsd === null ? "set the price variables" : "estimate"
            }
          />
        </div>
        {briefAi.rejectionsByReason.length > 0 && (
          <ul className="mt-3 text-sm text-foreground/80">
            {briefAi.rejectionsByReason.map((r) => (
              <li key={r.reason}>
                <span className="font-mono">{r.reason}</span>: {r.count}
              </li>
            ))}
          </ul>
        )}
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
