import type { AdminMetricsDto } from "@embr/types";
import { prisma } from "../../lib/prisma.js";

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
 * "Activity" is the union of the days a person logged a symptom, a
 * cycle or bleeding entry, or daily context.
 */

const ACTIVITY = `
  WITH people AS (
    SELECT id, "createdAt" FROM users WHERE role <> 'ADMIN'
  ),
  activity AS (
    SELECT DISTINCT a."userId", a.day FROM (
      SELECT "userId", ("occurredAt")::date AS day FROM symptom_logs
      UNION ALL SELECT "userId", date::date FROM cycle_entries
      UNION ALL SELECT "userId", date::date FROM context_logs
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

  const [retention] = await prisma.$queryRawUnsafe<Row[]>(
    `${ACTIVITY}
     SELECT
       count(*) AS cohort,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM activity a
         WHERE a."userId" = p.id
           AND a.day BETWEEN (p."createdAt")::date + 21 AND (p."createdAt")::date + 27
       )) AS retained
     FROM people p
     WHERE p."createdAt" >  $1::timestamp - interval '56 days'
       AND p."createdAt" <= $1::timestamp - interval '28 days'`,
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
    weekly: weekly.map((row) => ({
      weekStart: new Date(row.week_start as Date).toISOString().slice(0, 10),
      activePeople: n(row.active),
      newAccounts: n(row.new_accounts),
      briefsGenerated: n(row.briefs),
    })),
  };
}
