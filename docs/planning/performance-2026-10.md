# Performance review, October 2026

_11 October 2026. Measured locally; production numbers will differ by
network latency but the ranking should hold._

## Method

One local account was seeded with a heavy but realistic record: **3 years
of daily check ins**, 6,500 symptom entries, 1,095 daily context entries
and a period start every 33 days. Every read endpoint the web app calls was
timed 7 times and the median taken. The web app was built for production
to measure page weight.

## API results (median of 7)

| Endpoint                               | Time                 | Note                             |
| -------------------------------------- | -------------------- | -------------------------------- |
| `/auth/me`, `/consents`, `/onboarding` | 5 to 11 ms           |                                  |
| `/symptom-logs` (page of 20)           | 9 ms                 | Paginated                        |
| `/context-logs` (90 days)              | 9 ms                 |                                  |
| `/trends/symptom-frequency` (90 days)  | 4 ms                 | Counted in the database          |
| `/trends/co-occurrence` (90 days)      | 11 ms                |                                  |
| `/trends/context-co-occurrence`        | 16 ms                |                                  |
| `/trends/cycle-length`                 | 11 ms                |                                  |
| `/trends/evidence-strength`            | 34 to 50 ms          | Reads the whole record by design |
| **`/trends/symptom-history`**          | **1,631 ms → 85 ms** | Fixed in #222, see below         |
| `/briefs`, `/briefs/trends`, `/notes`  | 6 to 9 ms            |                                  |
| `/export/symptom-logs.csv` (230 kB)    | 104 to 166 ms        | Whole record, on demand only     |
| `/export/summary.pdf` (142 kB)         | 334 to 403 ms        | PDF rendering, on demand only    |

### The one real problem: symptom history

Timeline calls `/trends/symptom-history` on every visit. It took 1.6 seconds
for this account and grew with every entry, because `localDate` built a new
`Intl.DateTimeFormat` for each symptom entry. Building a formatter is far
slower than using one.

[#222](https://github.com/EMBR-Health-Dev/embr-app/pull/222) caches one
formatter per time zone. Same output, 85 ms, about 19 times faster. A test
fails on the old code and passes on the new.

Of the 85 ms left, Postgres spends 5.5 ms (it uses the existing
`(userId, occurredAt)` index); the rest is turning 6,500 rows into objects.
No index change is needed.

## Web results (production build)

| Measure                        | Value               |
| ------------------------------ | ------------------- |
| JavaScript shared by all pages | 103 kB              |
| Lightest page, first load      | 119 kB (onboarding) |
| Heaviest page, first load      | 148 kB (dashboard)  |
| Timeline, first load           | 131 kB              |
| BRIEF, first load              | 131 kB              |

These are in line with a typical Next.js app and need no work before
launch.

## Data organisation findings

| Finding                                                                                                                                    | Risk                                                             | Recommendation                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `cycle_entries` and `context_logs` each have a `@@unique([userId, date])` **and** a separate `@@index([userId, date])` on the same columns | Every write updates two identical indexes; no read benefit       | Drop the two duplicate `@@index` lines in a small migration after launch; low urgency                      |
| `symptomLogsForHistory` reads the whole record with no row cap, unlike the other whole record queries (`SYMPTOM_LOG_ROW_CAP`)              | Fine at years of daily use (6,500 rows in 85 ms); grows linearly | Leave uncapped, since "first logged" needs the whole record; revisit above about 50,000 entries per person |
| `audit_logs` grows without expiry (counsel brief question 10)                                                                              | Table growth, and a legal question                               | Wait for counsel's retention answer, then add a scheduled prune                                            |
| BRIEF PDF renders on each download (about 0.4 s)                                                                                           | Acceptable; on demand only                                       | No change                                                                                                  |

## How to repeat this

1. Seed a heavy account (3 years of daily entries) in a local database.
2. Sign in through `/auth/login` and time each endpoint above, median of 7.
3. Run `next build` in `apps/web` and read the route table.

Repeat before reopening sign up, and whenever a Timeline or BRIEF feature
adds a query.
