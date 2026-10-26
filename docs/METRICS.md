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
counted by calendar date.

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

- **Deleted accounts leave the denominator.** Deleting an account
  removes it immediately (`DELETE /auth/me`), along with its signup date.
  People who left and deleted their account no longer count against
  retention, which flatters the rate. A fix needs a schema change, such
  as an anonymous record of signup and deletion dates that keeps no
  personal data. That needs a decision before it is built.
- **Unverified and never-active accounts are in the cohort.** Someone
  who signed up but never verified her email or made a single entry
  counts in the denominator. That is the honest view of signups. An
  activation metric (for example, retention among people who made an
  entry in week 1) would answer a different question and is not built.
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
