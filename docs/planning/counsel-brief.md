# EMBR Counsel Brief

_Written 10 October 2026, updated 11 October 2026 for PRs #212, #214 and #220._
_Live copy: https://claude.ai/code/artifact/897bda19-b42a-45e6-9599-b8190b4bc871_

## Purpose

EMBR needs counsel's decisions on the questions in section 3 before public
sign up reopens. Sign up is closed today (`PUBLIC_REGISTRATION_ENABLED=false`),
and only invited early access users have accounts.

EMBR is a perimenopause symptom record. Women log symptoms, cycle and daily
context; EMBR counts and arranges them and produces a BRIEF to bring to a
clinician. It does not diagnose, predict or treat. AI is used only to put
already computed counts into plain words.

This brief was written by engineering from the code as of the date above.
It is not legal advice and makes no claim about which laws apply; that is
what we are asking counsel to decide. Draft Terms and Privacy Policy sit in
`docs/legal/drafts/` and are not published.

## Data inventory and flows

All account data is stored in one Postgres database on Railway in the EU
(Amsterdam). Two outside services receive personal data; only Anthropic
receives anything derived from health data, and only computed counts.

| Data                   | Examples                                                                                                                       | Health data? | Stored     | Leaves EMBR to                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account                | Email, hashed password, locale, role                                                                                           | No           | Railway EU | Resend (email address, for verification and reset emails)                                                                                               |
| Symptom logs           | Symptom from a fixed list of 14, severity, time, optional free text note                                                       | Yes          | Railway EU | Not sent as rows. Counts only, see BRIEF                                                                                                                |
| Cycle entries          | Flow level, period start or end                                                                                                | Yes          | Railway EU | Not sent                                                                                                                                                |
| Daily context          | Sleep bucket, afternoon caffeine, alcohol, stress, night sweats recalled in the morning, whether symptoms affected work (#225) | Yes          | Railway EU | Not sent. Night sweats and work impact are shown in the BRIEF but are not part of what the AI receives, and work impact is never in employer statistics |
| Treatments             | Name typed by the user, category, dates, optional reason for stopping (fixed list)                                             | Yes          | Railway EU | Not sent. Names are removed before anything reaches the AI, and the reason for stopping is never sent                                                   |
| Notebook (Notes)       | Title, free text body, cover colour                                                                                            | Possibly     | Railway EU | Not sent. Audit entries hold the note id only, never its text                                                                                           |
| Onboarding answers     | Why she came, areas noticed, appointment status                                                                                | Yes          | Railway EU | Not sent                                                                                                                                                |
| EMBR BRIEF             | Computed counts and patterns, AI worded text, PDF                                                                              | Yes          | Railway EU | Anthropic (US) receives computed counts and patterns to word them. No free text notes, no treatment names                                               |
| Consent records        | Which document version was accepted, language, time                                                                            | No           | Railway EU | Not sent                                                                                                                                                |
| Sessions and audit log | IP address, user agent, action, time                                                                                           | No           | Railway EU | Not sent                                                                                                                                                |
| Organisation billing   | Organisation name, plan, Stripe customer id                                                                                    | No           | Railway EU | Stripe, only if billing is switched on                                                                                                                  |

Other services: Formspree receives early access form entries from the
marketing website (name and email). Backups are encrypted, taken daily at
03:00 UTC and pruned after about 30 days. Error monitoring (Sentry) is
supported in code but not switched on in production.

## Decisions for counsel

Twelve questions block launch; 1 to 5 are carried over from
`docs/legal/consent-decision-sheet.md`. Each row says what the code does
today, so an answer can be turned into a change directly.

| #   | Question                                                                                                                                | What the code does until answered                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the legal basis for processing health data for EU and UK users (GDPR Art. 6 and Art. 9)?                                        | Records facts only: which version was shown, in which language, what was ticked, when                                                         |
| 2   | Is explicit consent required, and may opening an account depend on it?                                                                  | Configurable, default not required at sign up; health features are blocked on the server until the health item is accepted                    |
| 3   | What withdrawal mechanism is needed, and what happens to data already recorded?                                                         | A withdrawal endpoint exists and stops health features; existing data is kept, not processed, until the user deletes it. No screen for it yet |
| 4   | What consent evidence may be kept after account deletion, and for how long?                                                             | Consent records are deleted with the account and hold no IP address                                                                           |
| 5   | What extra Japanese APPI rules apply to health information (要配慮個人情報)?                                                            | One unchecked box per item, in the user's language, with the language recorded                                                                |
| 6   | Which entity is the controller, and in which country?                                                                                   | `[LEGAL ENTITY NAME]` placeholder in the drafts; not filled by engineering                                                                    |
| 7   | Do transfers abroad need extra steps: Japanese users to an EU database, and computed counts to Anthropic in the US?                     | Data stored in the EU; Anthropic receives counts and patterns only, no notes or treatment names                                               |
| 8   | Is EMBR a medical device, or software outside that rule, in each launch market (Japan, EU, UK, US)?                                     | Copy says EMBR describes and does not diagnose, predict or treat; the website FAQ says it is not a medical device                             |
| 9   | Which processors need a signed data processing agreement, and are their terms adequate (Railway, Anthropic, Resend, Formspree, Stripe)? | Unknown to engineering whether agreements are signed                                                                                          |
| 10  | How long may the security audit log, with IP address and user agent, be kept, and must it be in a person's own data download?           | Kept with no expiry; when an account is deleted, its log entries stay but lose the link to the user. Left out of the all data download        |
| 11  | What retention wording is right, given that backups keep deleted data for about 30 days?                                                | Deletion is immediate in the live database; backups roll off after about 30 days                                                              |
| 12  | What must breach notification cover (GDPR 72 hours, APPI report to the PPC), and who is responsible?                                    | `docs/INCIDENT_RESPONSE.md` exists, with no named people and no error monitoring switched on                                                  |

Also needed from counsel: the final Terms and Privacy Policy in English and
Japanese with the same legal meaning, and whether the early access
acknowledgements (versions `0.1-draft` and `0.2-draft`) must be collected
again when the final documents are published.

## What engineering has already built

The controls counsel is likely to ask about exist in code and have tests;
the table says where.

| Control             | What it does                                                                                                                            | Where                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Consent records     | Append only; one row per acceptance or withdrawal, with version, language and time; no boxes ticked in advance                          | `ConsentRecord` model, `apps/api/src/modules/consent`                     |
| Health feature gate | Health data cannot be written until the health item is current                                                                          | `requireCurrentConsent` middleware on every health route, including Notes |
| Versioned documents | Raising a version asks every user to review that item again at next sign in                                                             | `LEGAL_DOCUMENT_VERSIONS` in `packages/validation`                        |
| Account deletion    | Deletes the account and all its health data at once; tested end to end                                                                  | `DELETE /auth/me`                                                         |
| Data export         | The whole record as one JSON file (account, onboarding answers, consent history, every entry, note and BRIEF); CSVs and PDF for reading | `apps/api/src/modules/export`, `apps/api/src/modules/briefs`              |
| AI boundary         | Only computed counts and patterns reach Anthropic; notes, notebook entries, treatment names and night sweats recall are not sent        | `stage4-ai-projection.ts`                                                 |
| Audit log           | Sign in, consent, symptom, check in, BRIEF, export and notebook events                                                                  | `apps/api/src/modules/auth/audit.ts`                                      |
| Data location       | Database and backups in the EU (Amsterdam)                                                                                              | Railway                                                                   |
| Closed sign up      | Public registration is off until a deliberate switch                                                                                    | `PUBLIC_REGISTRATION_ENABLED`, `NEXT_PUBLIC_REGISTRATION_OPEN`            |

## Known gaps

Five gaps are engineering's to close before launch.

- [x] **Export is incomplete.** Closed: `GET /export/all-data.json`
      adds onboarding answers, consent history, BRIEFs and organisation
      memberships to everything the CSVs already held.
- [ ] **No screen to withdraw consent.** The endpoint exists; the Settings
      screen waits on counsel's answer to question 3.
- [ ] **Error monitoring is off.** Sentry is supported but `SENTRY_DSN` is
      not set, which slows breach detection (question 12).
- [ ] **No recorded restore test.** Backups run daily; nobody has yet
      restored one and written down the result.
- [ ] **Incident response has no named people.** The plan exists; it
      needs owners and one practice run.

Night sweats recall now appears in the BRIEF (#214) but is deliberately
left out of what the AI receives. If that ever changes, the Privacy Policy
description of Anthropic must say so first.
