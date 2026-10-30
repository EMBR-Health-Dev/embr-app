# Baseline check in: saving the first check in to an account

Status: proposed for review. Nothing here is deployed. The migration runs
on the next production deploy after merge (Railway runs
`prisma migrate deploy` before the API starts), so merging needs explicit
approval. The feature stays off in production until the web flag
`NEXT_PUBLIC_FIRST_CHECK_IN_ENABLED` is turned on, which also needs
approval, and saving from a signed out visit also needs sign up open.

Spec: "EMBR account free first check in" (Claude doc), phase 2. Phase 1
(the device only check in and result) is in PR #295.

## Decisions this follows

1. One baseline per account, ever, and it is never changed. The database
   enforces it (`user_id` is unique). Saving again returns the existing
   baseline unchanged.
2. The check in asks about the last 14 days. The window is stored with
   the baseline (`recall_days`), and the answers are her own recall: self
   reported, not a validated clinical score.
3. `/check-in` stays a separate entry point; the landing page is not
   changed.
4. Answers stay in the browser tab (session storage) until the save is
   confirmed. No persistent local storage.
5. Existing sign up and sign in are reused. Answers are cleared only after
   the server confirms the baseline exists.
6. Saving needs current health information consent, including for people
   who already had an account. The consent record (type, version, time)
   stays in the existing consent ledger, separate from Terms, and the
   baseline also keeps the version and time of the health consent that
   covered it.
7. Privacy Policy, consent wording, retention and deletion are reviewed
   before production activation (open item, below).
8. No analytics in this change.

## Database migration

`20261029120000_baseline_check_ins`, additive only: two new tables and one
new enum. A second migration, `20261030140000_baseline_symptoms_answered`,
adds the one column `symptomsAnswered` (default false) to a table the first migration creates. Neither changes an existing table or column, so it is safe to roll
forward and nothing existing is rewritten.

```prisma
/// How often a symptom happened over the recall window, as she recalls it.
enum RecallFrequency {
  FEW_DAYS
  HALF_THE_DAYS
  MOST_DAYS
}

model BaselineCheckIn {
  id                   String                 @id @default(uuid())
  userId               String                 @unique
  user                 User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  completedOn          DateTime               @db.Date   // her local date
  timeZone             String                            // IANA zone she completed it in
  recallDays           Int                    @default(14) @db.SmallInt
  locale               BriefLocale                       // language the questions were shown in
  goal                 OnboardingJobToBeDone?
  sleepDuration        SleepDurationBucket?
  workImpact           WorkImpact?
  symptomsAnswered     Boolean                           @default(false)  // skipped vs answered
  healthConsentVersion String                            // copied from the consent ledger at save time
  healthConsentAt      DateTime
  createdAt            DateTime               @default(now())
  symptoms             BaselineCheckInSymptom[]
  @@map("baseline_check_ins")
}

model BaselineCheckInSymptom {
  id                String           @id @default(uuid())
  baselineCheckInId String
  baselineCheckIn   BaselineCheckIn  @relation(fields: [baselineCheckInId], references: [id], onDelete: Cascade)
  category          SymptomCategory
  severity          SeverityLevel?
  frequency         RecallFrequency?
  @@unique([baselineCheckInId, category])
  @@map("baseline_check_in_symptoms")
}
```

- No `updatedAt` and no update or delete endpoint: the baseline is
  immutable. It goes only with the account.
- A symptom she did not pick is not stored (never as "absent"), as in
  the daily check in. `OTHER` is refused because the check in has no free
  text.
- Nothing is written to `symptom_logs`, `context_logs` or the onboarding
  profile, so BRIEFs, patterns, trends, reflections and the weekly email
  are unchanged.
- Not encrypted at field level: no column holds free text (see
  docs/ENCRYPTION.md, which encrypts free text fields).

## API

Both routes: `requireAuth()` then `requireCurrentConsent()` (Terms,
Privacy and health processing all current; the same gate as every health
route). Email verification is not required, matching the daily check in.

### `POST /baseline-check-ins`

Rate limited (the shared write limiter). CSRF checked for cookie sessions.

Request:

```json
{
  "completedOn": "2026-10-29",
  "timeZone": "Asia/Tokyo",
  "locale": "ja",
  "goal": "PREPARE_FOR_APPOINTMENT",
  "sleepDuration": "UNDER_6H",
  "workImpact": null,
  "symptoms": [
    { "category": "HOT_FLASH", "severity": "SEVERE", "frequency": "MOST_DAYS" },
    { "category": "BRAIN_FOG", "severity": null, "frequency": null }
  ]
}
```

- `completedOn` must be her local today or up to 7 days before (a tab left
  open), never in the future, judged in `timeZone`.
- `timeZone` must be a known IANA zone.
- `symptoms`: unique categories, at most one per category, no `OTHER`.
- `symptomsAnswered`: true when she picked symptoms or chose "none of
  these", false when she skipped the question. It must be true whenever
  `symptoms` is not empty. An empty list with `false` means "not
  answered" and is never read as "no symptoms".

Responses:

| Status                 | When                                          | Body                                                                |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| 201                    | Saved now                                     | `{ data: { baseline, created: true } }`                             |
| 200                    | She already has one                           | `{ data: { baseline, created: false } }`, the stored one, unchanged |
| 400                    | Invalid body                                  | validation details                                                  |
| 401                    | Not signed in                                 |                                                                     |
| 403 `CONSENT_REQUIRED` | Health consent missing, withdrawn or outdated |                                                                     |
| 429                    | Rate limited                                  |                                                                     |

Two saves at the same moment both end with the one stored baseline: the
second insert hits the unique index and returns the first.

Audit log: `BASELINE_CHECK_IN_SAVED` with the date and the symptom count
only, never a symptom or answer.

### `GET /baseline-check-ins`

`{ data: { baseline: BaselineCheckInDto | null } }` for the signed in
person only. There is no id in the path, so one person cannot ask for
another's.

`BaselineCheckInDto`: `id, completedOn, timeZone, recallDays, locale,
goal, sleepDuration, workImpact, symptoms[{category, severity,
frequency}], healthConsentVersion, healthConsentAt, createdAt`.

## Sign in and consent in the web flow

- Signed out, sign up open: the result offers **Save and keep tracking**,
  which opens the existing `/register?redirect=/check-in` in the same tab
  (session storage survives). After the account is created, the page
  signs her in with the password she just typed through the existing
  `POST /auth/login`, then returns to `/check-in`. If that sign in fails,
  she sees the existing "check your email" page with a link to log in and
  come back; her answers are still in the tab.
- Signed out, sign up closed (production today): **Request early access**,
  unchanged from phase 1. Nothing is sent.
- Signed in without current health consent: the existing consent gate
  sends her to `/consent?redirect=/check-in`, where health consent is its
  own checkbox, separate from Terms. Accepting writes a ledger record
  (type, version, locale, time) and returns her to her result.
- Signed in with current consent: **Save as my starting point** posts the
  answers once. On 201 or 200 the answers are cleared from the tab. On
  any error or no response they stay, with a message and **Try again**.
  A retry after a lost response is safe: the server returns the stored
  baseline.
- If she already had a baseline (200, `created: false`), the page says
  hers from that date is kept unchanged and offers to clear these answers.

## Export and account deletion

- `GET /export/all-data.json` gains `baselineCheckIn` (null if none), with
  its symptoms, without internal ids or `userId`. The export layout
  version goes from 1 to 2.
- Account deletion: both tables cascade from `users`, so the existing
  `deleteUserAccount` removes them with no code change. A test proves it.

## Tests

API, against the real Postgres CI uses:

- 401 signed out; 403 without health consent, after withdrawal, and with
  an outdated version; saves with current consent and keeps its version
  and time.
- Duplicate save returns the first, unchanged; two simultaneous saves
  leave one row.
- Isolation: each person reads only her own baseline.
- Validation: `OTHER`, repeated category, future or stale date, unknown
  time zone.
- Export includes it; account deletion removes it; nothing is written to
  daily symptom or context logs.

Web: save confirmed clears the tab; failure keeps answers and retries;
duplicate message; sign up path signs in then returns; sign in failure
keeps answers; closed sign up still shows early access only.

## Open before production activation

- Privacy Policy text describing the device only check in and the saved
  baseline; qualified privacy review of the consent and policy wording.
- Retention: the baseline is kept for the life of the account and deleted
  with it, like the rest of her record. Confirm with counsel.
- Clinical review of the clinician questions in EN, JA and FR; native
  review of JA and FR copy; reviewers to be named.
- Approval to merge (which runs the migration in production), to turn on
  `NEXT_PUBLIC_FIRST_CHECK_IN_ENABLED`, and separately to open sign up.
