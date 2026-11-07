# Product metrics

What each number on the admin dashboard means. The SQL is in
`apps/api/src/modules/admin/admin.metrics.ts`, and these definitions are
checked against Postgres in `apps/api/test/integration/admin-metrics.test.ts`.

Every metric is a count. None reads a symptom, a note, a treatment or
any other content, and none describes one person. Accounts with the
ADMIN role are left out of every metric.

## Activity

A person is **active on a day** when she makes or changes a symptom
entry, a cycle or bleeding entry, or a daily context entry that day.

- **What counts:** the day comes from the entry's `createdAt` and
  `updatedAt`. It does not come from the date the entry describes
  (`occurredAt` or `date`).
  - Entries can be filled in for earlier days. On day 35 someone can
    add a period start for day 23. Counting the described date would
    credit her with using EMBR on day 23, when she was not.
  - An edit is a contribution. Correcting yesterday's answer today makes
    today an active day.
- **What does not count:** signing in, viewing pages, notes, treatments
  and BRIEFs. Notes are private and never part of the record a clinician
  sees. Treatments change rarely. BRIEFs have their own metrics below.
  The measure is whether people keep adding to their record.
- **Days are UTC calendar days.** For someone in Tokyo or Pago Pago an
  entry made late in her evening can count on the neighbouring UTC day.
  Over a 7, 28 or 30 day window this moves little. Per-person time zones
  are not stored, so this cannot yet be corrected.

| Metric                        | Definition                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Active, 7 days                | People active on at least one of the last 7 days, today included                            |
| Active, 30 days               | The same over the last 30 days                                                              |
| Days logged per active person | Active days in the last 7 days, divided by the number of people active in that window       |
| Weekly active people          | People active on at least one day of each ISO week (Monday to Sunday), for the last 8 weeks |

## Week 4 retention

**Retained** means active on at least one of days 21 to 27 after
signing up, where the signup day is day 0. In other words, active during
her fourth week.

**Cohort (the denominator):** everyone who signed up 28 to 55 days ago,
counted by calendar date, including people who have since deleted
their account (see Known limits).

- Someone who signed up 28 days ago reached day 27 yesterday, so her
  week 4 is complete.
- Someone who signed up 27 days ago is still in week 4 and is not
  counted yet. A cohort never includes a person who has not had the
  whole week, so the rate is never pulled down by people who simply
  have not got there yet.
- The window covers four whole signup weeks, which keeps the cohort
  large enough to read. The dashboard shows the counts beside the rate
  (for example "12 of 40") so a small cohort is visible.

**Rate:** retained ÷ cohort. It is empty when the cohort is empty.

## Known limits

- **Deleted accounts stay in the cohort, but nowhere else.** Deleting
  an account (`DELETE /auth/me`) removes everything about her. In the
  same transaction, just before her data is removed, one anonymous row
  is written to `deleted_accounts`. It holds her signup date, the
  deletion date, and whether she made or changed an entry on days 21 to 27. It has no id, email or link to any other row. Week 4 retention
  adds these rows to the cohort and the retained count, so leaving and
  deleting does not flatter the rate. Admin accounts get no row. The
  other metrics (accounts, new accounts, active people, the weekly
  table) count only accounts that still exist.
- **Unverified and never-active accounts are in the cohort.** Someone
  who signed up but never verified her email or made a single entry
  counts in the denominator. That is the honest view of signups. An
  activation metric answers a different question; see Activation
  below.
- **Activity before this definition.** Rows created by the demo seed
  script, or imported in bulk, carry the time they were inserted, not
  the time a person made them. The seed script refuses to run against
  production (see `apps/api/src/scripts/seed-demo-history.ts`).

## Accounts and BRIEFs

| Metric              | Definition                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| Accounts            | All non-admin accounts                                                              |
| Verified            | Accounts with a verified email                                                      |
| Finished onboarding | Accounts whose onboarding is marked complete                                        |
| New, 7 and 30 days  | Accounts created in the last 7 and 30 days (rolling, by time)                       |
| BRIEFs created      | BRIEFs generated in the last 7 and 30 days                                          |
| BRIEFs downloaded   | PDF downloads in the last 30 days, from the audit log (`CLINICAL_BRIEF_DOWNLOADED`) |
| People with a BRIEF | People who have generated at least one BRIEF, ever                                  |

## Activation

Signup day is day 0. As with week 4 retention, a cohort only holds
people whose whole window is over, so recent signups never pull a rate
down before they have had the chance.

| Metric                 | Cohort (denominator)                 | Reached (numerator)                                                                   |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| First log in 48 hours  | Signed up 2 to 30 days ago           | Made her first symptom entry (`symptom_logs.createdAt`) within 48 hours of signing up |
| 7 of her first 14 days | Signed up 14 to 55 days ago, by date | Active (the Activity rule above) on at least 7 distinct days among days 0 to 13       |

Deleted accounts are not in these cohorts (only week 4 retention keeps
them). Admin accounts are excluded.

## BRIEF AI reliability

From `brief_ai_runs`, one row per attempt at the BRIEF's optional AI
wording, written by `brief-ai-runs.ts`. A row holds the outcome, a
reason code, the model, prompt version, language, latency and token
counts. It holds no user id, brief id or text, so it cannot say whose
brief it was or what it said. For the same reason, attempts by admin or
test accounts are counted too.

| Metric                  | Definition                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rejection rate, 30 days | Rejected attempts divided by all attempts. A rejected attempt still saves the BRIEF, without the wording                                                  |
| Rejections by reason    | `timeout`, `upstream_unavailable`, `upstream_error`, `no_text`, `truncated`, `invalid_json`, `invalid_shape`, `citation`, `content_safety`, `unknown`     |
| Latency                 | Median and 95th percentile of the model call, including its one retry                                                                                     |
| Tokens                  | Mean input and output tokens per attempt                                                                                                                  |
| Cost per BRIEF          | Mean tokens times the prices in `BRIEF_AI_INPUT_USD_PER_MTOK` and `BRIEF_AI_OUTPUT_USD_PER_MTOK`. Shown only when both are set; never estimated otherwise |

## Appointment outcome

Her answer, per BRIEF, to "Did your EMBR BRIEF help you communicate
your symptoms or concerns during your appointment?" (`brief_feedback`).
The dashboard shows how many answers of each kind, all time, admin
accounts excluded. It never shows the optional comment, which is
encrypted at rest. An answer is removed with its BRIEF or her account,
so deleting either removes it from the counts.

A useful reading excludes "I have not had an appointment yet": of the
people who have had one, how many said yes.
