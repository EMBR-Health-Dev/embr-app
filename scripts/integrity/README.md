# Local integrity check

An end-to-end check of EMBR's health data handling against a **local**
stack: the real API, real Postgres and real Redis. It signs up throwaway
accounts, logs symptoms, generates and deletes BRIEFs, downloads exports
and deletes an account, then checks the results through the API, the
PDFs and the database.

It refuses to run unless the API, database and Redis are all on
localhost, and it deletes every account it created when it finishes.
Never point it at staging or production data.

## What it checks

- **Local days across time zones** (Asia/Tokyo morning, America/Los_Angeles
  evening): symptom history, the BRIEF and its day-level dates, and the
  clinician summary PDF all put an entry on the day she logged it; the
  summary PDF still prints UTC when no time zone is sent; an unknown time
  zone is a 400.
- **Check in rules**: a check in older than yesterday is refused.
- **BRIEF lifecycle**: create, history, a fixed snapshot that later entries
  don't change, no access from another account, delete removes it from
  the detail view, PDF, history, the JSON export and the database, and a
  second delete is a clean 404.
- **Account deletion**: no rows left in any table with a `userId` column.
- **Languages**: a BRIEF made in English, Japanese or French keeps that
  language, including its PDF downloaded from another language.
- **Exports**: the symptom CSV header names its UTC timestamp.

## What it does not check

**BRIEF narrative quality.** The API's AI call goes to `ai-stub.mjs`, a
local stand-in that returns fixed text, because the check must run
offline and deterministically. Every count, date, pattern, PDF and
database row comes from the real code; the narrative sentences do not.
A passing run says nothing about live AI output; that needs its own
review against the real model.

It is also not a test of the web or mobile screens, and not a load test.

## Running it

From the repo root, with local Postgres and Redis running and the
validation package built (`pnpm --filter @embr/validation build`):

```sh
# 1. The AI stand-in
node scripts/integrity/ai-stub.mjs &

# 2. The API, with sign up open, email sending off, and the stand-in
#    in place of the AI service (other settings from your .env)
cd apps/api
PUBLIC_REGISTRATION_ENABLED=true RESEND_API_KEY= \
  ANTHROPIC_BASE_URL=http://127.0.0.1:4555 npx tsx src/server.ts &
cd ../..

# 3. The check (DATABASE_URL: the same local database the API uses)
DATABASE_URL=postgresql://... node scripts/integrity/run.mjs
```

It needs `psql` and `redis-cli` on the path. Optional:
`INTEGRITY_API_URL` (default `http://localhost:4000`), `REDIS_URL`
(default `redis://localhost:6379`), `AI_STUB_PORT` (default 4555).
It exits non-zero if any check fails.
