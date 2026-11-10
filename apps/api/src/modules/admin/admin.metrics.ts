import type { AdminMetricsDto, AppointmentOutcome } from "@embr/types";
import { env } from "../../config/env.js";
import { prisma, type TransactionClient } from "../../lib/prisma.js";

/**
 * Aggregate product metrics for the admin app. Every query returns
 * counts only, over the dates entries were made, never their content;
 * nothing here reads a symptom category, a note or a treatment. People
 * with the ADMIN role are excluded throughout so test and staff
 * accounts don't inflate the numbers.
 *
 * The SQL is static; the only parameter is the reference date, passed
 * as a bound value ($1), so $queryRawUnsafe here takes no user input.
 *
 * "Activity" is the days a person made or changed a symptom, cycle or
 * bleeding, or daily context entry: the rows' createdAt and updatedAt
 * dates, not the date an entry describes. Entries can be filled in for
 * past days, so the described date would credit someone with using
 * EMBR on days she did not. Days are UTC dates. The full definitions,
 * week 4 retention included, are in docs/METRICS.md.
 */

const ACTIVITY = `
  WITH people AS (
    SELECT id, "createdAt" FROM users WHERE role <> 'ADMIN'
  ),
  activity AS (
    SELECT DISTINCT a."userId", a.day FROM (
      SELECT "userId", ("createdAt")::date AS day FROM symptom_logs
      UNION ALL SELECT "userId", ("updatedAt")::date FROM symptom_logs
      UNION ALL SELECT "userId", ("createdAt")::date FROM cycle_entries
      UNION ALL SELECT "userId", ("updatedAt")::date FROM cycle_entries
      UNION ALL SELECT "userId", ("createdAt")::date FROM context_logs
      UNION ALL SELECT "userId", ("updatedAt")::date FROM context_logs
    ) a
    JOIN people p ON p.id = a."userId"
  )`;

type Row = Record<string, bigint | number | string | Date | null>;

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export async function computeAdminMetrics(now = new Date()): Promise<AdminMetricsDto> {
  const [accounts] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL) AS verified,
       count(*) FILTER (WHERE o."completedAt" IS NOT NULL) AS onboarded,
       count(*) FILTER (WHERE u."createdAt" >= $1::timestamp - interval '7 days') AS new7d,
       count(*) FILTER (WHERE u."createdAt" >= $1::timestamp - interval '30 days') AS new30d
     FROM users u
     LEFT JOIN onboarding_profiles o ON o."userId" = u.id
     WHERE u.role <> 'ADMIN'`,
    now,
  );

  const [activity] = await prisma.$queryRawUnsafe<Row[]>(
    `${ACTIVITY}
     SELECT
       count(DISTINCT "userId") FILTER (WHERE day > ($1::timestamp)::date - 7) AS active7d,
       count(DISTINCT "userId") FILTER (WHERE day > ($1::timestamp)::date - 30) AS active30d,
       count(*) FILTER (WHERE day > ($1::timestamp)::date - 7) AS daysLogged7d
     FROM activity
     WHERE day <= ($1::timestamp)::date`,
    now,
  );

  // People who deleted their account stay in the cohort they signed up
  // in, through the anonymous deleted_accounts rows (see
  // recordDeletedAccount below); otherwise leaving and deleting would
  // flatter the rate.
  const [retention] = await prisma.$queryRawUnsafe<Row[]>(
    `${ACTIVITY},
     deleted AS (
       SELECT count(*) AS cohort, count(*) FILTER (WHERE "activeWeek4") AS retained
       FROM deleted_accounts
       WHERE "signupDate" BETWEEN ($1::timestamp)::date - 55 AND ($1::timestamp)::date - 28
     ),
     current AS (
     SELECT
       count(*) AS cohort,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM activity a
         WHERE a."userId" = p.id
           AND a.day BETWEEN (p."createdAt")::date + 21 AND (p."createdAt")::date + 27
       )) AS retained
     FROM people p
     -- Signup day is day 0. Everyone who signed up 28 to 55 days ago has
     -- had all of days 21 to 27, so no one enters the denominator before
     -- her week 4 is over; four whole signup weeks, by date, not by
     -- time of day.
     WHERE (p."createdAt")::date BETWEEN ($1::timestamp)::date - 55
                                     AND ($1::timestamp)::date - 28
     )
     SELECT current.cohort + deleted.cohort AS cohort,
            current.retained + deleted.retained AS retained
     FROM current, deleted`,
    now,
  );

  const [briefs] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       count(*) FILTER (WHERE b."createdAt" >= $1::timestamp - interval '7 days') AS generated7d,
       count(*) FILTER (WHERE b."createdAt" >= $1::timestamp - interval '30 days') AS generated30d,
       count(DISTINCT b."userId") AS peopleWithBrief,
       (SELECT count(*) FROM audit_logs l
          JOIN users lu ON lu.id = l."userId" AND lu.role <> 'ADMIN'
         WHERE l.action = 'CLINICAL_BRIEF_DOWNLOADED'
           AND l."createdAt" >= $1::timestamp - interval '30 days') AS downloaded30d
     FROM clinical_briefs b
     JOIN users u ON u.id = b."userId" AND u.role <> 'ADMIN'`,
    now,
  );

  const weekly = await prisma.$queryRawUnsafe<Row[]>(
    `${ACTIVITY},
     weeks AS (
       SELECT generate_series(
         date_trunc('week', $1::timestamp) - interval '7 weeks',
         date_trunc('week', $1::timestamp),
         interval '1 week'
       )::date AS week_start
     )
     SELECT
       w.week_start,
       (SELECT count(DISTINCT a."userId") FROM activity a
         WHERE a.day >= w.week_start AND a.day < w.week_start + 7) AS active,
       (SELECT count(*) FROM people p
         WHERE p."createdAt" >= w.week_start AND p."createdAt" < w.week_start + 7) AS new_accounts,
       (SELECT count(*) FROM clinical_briefs b JOIN people p ON p.id = b."userId"
         WHERE b."createdAt" >= w.week_start AND b."createdAt" < w.week_start + 7) AS briefs
     FROM weeks w
     ORDER BY w.week_start`,
    now,
  );

  // Activation. Signup day is day 0; a cohort only holds people whose
  // whole window is over, the same rule as week 4 retention.
  const [activation] = await prisma.$queryRawUnsafe<Row[]>(
    `${ACTIVITY},
     first_log AS (
       SELECT p.id, min(s."createdAt") AS first_at
       FROM people p JOIN symptom_logs s ON s."userId" = p.id
       GROUP BY p.id
     )
     SELECT
       (SELECT count(*) FROM people p
         WHERE p."createdAt" BETWEEN $1::timestamp - interval '30 days'
                                 AND $1::timestamp - interval '48 hours') AS log_cohort,
       (SELECT count(*) FROM people p JOIN first_log f ON f.id = p.id
         WHERE p."createdAt" BETWEEN $1::timestamp - interval '30 days'
                                 AND $1::timestamp - interval '48 hours'
           AND f.first_at <= p."createdAt" + interval '48 hours') AS log_reached,
       (SELECT count(*) FROM people p
         WHERE (p."createdAt")::date BETWEEN ($1::timestamp)::date - 55
                                         AND ($1::timestamp)::date - 14) AS seven_cohort,
       (SELECT count(*) FROM people p
         WHERE (p."createdAt")::date BETWEEN ($1::timestamp)::date - 55
                                         AND ($1::timestamp)::date - 14
           AND (SELECT count(*) FROM activity a
                 WHERE a."userId" = p.id
                   AND a.day BETWEEN (p."createdAt")::date AND (p."createdAt")::date + 13) >= 7
       ) AS seven_reached`,
    now,
  );

  // brief_ai_runs holds no user id by design, so attempts by admin or
  // test accounts are counted too.
  const [aiRuns] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       count(*) AS attempts,
       count(*) FILTER (WHERE outcome = 'REJECTED') AS rejected,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95,
       avg("inputTokens") AS avg_in,
       avg("outputTokens") AS avg_out
     FROM brief_ai_runs
     WHERE "createdAt" >= $1::timestamp - interval '30 days'`,
    now,
  );
  const reasons = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT coalesce(reason, 'unknown') AS reason, count(*) AS count
     FROM brief_ai_runs
     WHERE outcome = 'REJECTED' AND "createdAt" >= $1::timestamp - interval '30 days'
     GROUP BY 1 ORDER BY 2 DESC, 1`,
    now,
  );

  const outcomes = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT f.answer::text AS answer, count(*) AS count
     FROM brief_feedback f
     JOIN users u ON u.id = f."userId" AND u.role <> 'ADMIN'
     GROUP BY 1`,
  );

  const active7d = n(activity?.active7d);
  const cohort = n(retention?.cohort);
  const retained = n(retention?.retained);

  return {
    generatedAt: now.toISOString(),
    accounts: {
      total: n(accounts?.total),
      verified: n(accounts?.verified),
      onboarded: n(accounts?.onboarded),
      new7d: n(accounts?.new7d),
      new30d: n(accounts?.new30d),
    },
    activity: {
      active7d,
      active30d: n(activity?.active30d),
      avgDaysLogged7d:
        active7d > 0 ? Math.round((n(activity?.dayslogged7d) / active7d) * 10) / 10 : null,
    },
    retentionWeek4: {
      cohort,
      retained,
      rate: cohort > 0 ? Math.round((retained / cohort) * 1000) / 1000 : null,
    },
    briefs: {
      generated7d: n(briefs?.generated7d),
      generated30d: n(briefs?.generated30d),
      downloaded30d: n(briefs?.downloaded30d),
      peopleWithBrief: n(briefs?.peoplewithbrief),
    },
    activation: {
      firstLog48h: ratio(n(activation?.log_cohort), n(activation?.log_reached)),
      sevenOfFourteen: ratio(n(activation?.seven_cohort), n(activation?.seven_reached)),
    },
    briefAi: briefAiSummary(aiRuns, reasons),
    appointmentOutcomes: appointmentSummary(outcomes),
    weekly: weekly.map((row) => ({
      weekStart: new Date(row.week_start as Date).toISOString().slice(0, 10),
      activePeople: n(row.active),
      newAccounts: n(row.new_accounts),
      briefsGenerated: n(row.briefs),
    })),
  };
}

function ratio(cohort: number, reached: number) {
  return {
    cohort,
    reached,
    rate: cohort > 0 ? Math.round((reached / cohort) * 1000) / 1000 : null,
  };
}

const roundOrNull = (v: unknown, digits = 0): number | null => {
  if (v === null || v === undefined) return null;
  const f = 10 ** digits;
  return Math.round(Number(v) * f) / f;
};

function briefAiSummary(row: Row | undefined, reasons: Row[]): AdminMetricsDto["briefAi"] {
  const attempts = n(row?.attempts);
  const rejected = n(row?.rejected);
  const avgIn = roundOrNull(row?.avg_in);
  const avgOut = roundOrNull(row?.avg_out);
  const inPrice = env.BRIEF_AI_INPUT_USD_PER_MTOK;
  const outPrice = env.BRIEF_AI_OUTPUT_USD_PER_MTOK;
  const cost =
    inPrice !== undefined && outPrice !== undefined && avgIn !== null && avgOut !== null
      ? Math.round(((avgIn * inPrice + avgOut * outPrice) / 1_000_000) * 10_000) / 10_000
      : null;
  return {
    attempts30d: attempts,
    rejected30d: rejected,
    rejectionRate: attempts > 0 ? Math.round((rejected / attempts) * 1000) / 1000 : null,
    rejectionsByReason: reasons.map((r) => ({ reason: String(r.reason), count: n(r.count) })),
    latencyP50Ms: roundOrNull(row?.p50),
    latencyP95Ms: roundOrNull(row?.p95),
    avgInputTokens: avgIn,
    avgOutputTokens: avgOut,
    estimatedCostPerBriefUsd: cost,
  };
}

const OUTCOMES: AppointmentOutcome[] = [
  "YES_SIGNIFICANTLY",
  "YES_SOMEWHAT",
  "NOT_REALLY",
  "NO",
  "NO_APPOINTMENT_YET",
];

function appointmentSummary(rows: Row[]): AdminMetricsDto["appointmentOutcomes"] {
  const byAnswer = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<
    AppointmentOutcome,
    number
  >;
  for (const row of rows) {
    const answer = String(row.answer) as AppointmentOutcome;
    if (answer in byAnswer) byAnswer[answer] = n(row.count);
  }
  return { answered: OUTCOMES.reduce((sum, o) => sum + byAnswer[o], 0), byAnswer };
}

/**
 * Writes the anonymous row that keeps a deleted account in week 4
 * retention: her signup date, today's date, and whether she made or
 * changed an entry on days 21 to 27 (the same activity rule as ACTIVITY
 * above, for one person). Called inside the deletion's transaction,
 * before her rows are removed. Nothing that identifies her is kept, and
 * admin accounts are skipped, as they are in every metric.
 */
export async function recordDeletedAccount(
  tx: TransactionClient,
  userId: string,
  now = new Date(),
): Promise<void> {
  const [row] = await tx.$queryRawUnsafe<Row[]>(
    `SELECT
       (u."createdAt")::date AS signup_date,
       EXISTS (
         SELECT 1 FROM (
           SELECT "createdAt" AS at FROM symptom_logs WHERE "userId" = u.id
           UNION ALL SELECT "updatedAt" FROM symptom_logs WHERE "userId" = u.id
           UNION ALL SELECT "createdAt" FROM cycle_entries WHERE "userId" = u.id
           UNION ALL SELECT "updatedAt" FROM cycle_entries WHERE "userId" = u.id
           UNION ALL SELECT "createdAt" FROM context_logs WHERE "userId" = u.id
           UNION ALL SELECT "updatedAt" FROM context_logs WHERE "userId" = u.id
         ) a
         WHERE (a.at)::date BETWEEN (u."createdAt")::date + 21 AND (u."createdAt")::date + 27
       ) AS active_week4
     FROM users u
     WHERE u.id = $1 AND u.role <> 'ADMIN'`,
    userId,
  );
  if (!row) return;
  await tx.deletedAccount.create({
    data: {
      signupDate: row.signup_date as Date,
      deletedDate: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`),
      activeWeek4: Boolean(row.active_week4),
    },
  });
}
