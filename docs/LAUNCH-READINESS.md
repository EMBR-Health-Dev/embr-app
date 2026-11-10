# EMBR Launch Readiness

The control document for moving EMBR from beta interest to real users.
It is split into five tracks that gate different things, so that a
clinical review never blocks collecting interest, and legal and security
work stays a genuine gate on processing anyone's health data:

| Track                             | What it gates                                     | Blocked by                       |
| --------------------------------- | ------------------------------------------------- | -------------------------------- |
| A. Beta interest collection       | Collecting names and emails of interested people  | Nothing clinical; privacy notice |
| B. Account registration readiness | Turning on sign up (the three registration flags) | Legal documents, consent wording |
| C. Health data processing         | Recording anyone's symptoms                       | Legal basis, consent, security   |
| D. Clinical validation            | Clinical claims and clinical content in the app   | A menopause clinician's sign off |
| E. Commercial launch              | Public launch, pricing, employer sales            | A to D, plus company and support |

Status key: **Done** (verified, evidence named), **In progress**, **Not
started**, **Decision** (waiting on a person), **Unverified** (true in
code on `main`; the production setting could not be checked from the
review environment).

_Last reviewed: 2 November 2026, against `main` at `15b57e9`._ Code
evidence is from `main`. Production configuration (Railway variables,
DNS, the live site) could not be reached from the review environment,
so anything that depends on it is marked Unverified rather than Done.

## A. Beta interest collection

Not gated on clinical sign off. People can say they are interested
without creating an account or giving any health information.

| Item                                 | Status   | Evidence / next step                                                                                                                                                                       |
| ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Early access by email (site and app) | Done     | `apps/web/src/lib/registration.ts` `EARLY_ACCESS_HREF`; `/register` and the login page show it while sign up is closed; mobile links to web sign up (`apps/mobile/lib/registration.ts`)    |
| Waitlist form on the website         | Decision | [landingpage#10](https://github.com/EMBR-Health-Dev/landingpage/pull/10) adds a form (email, country, language, optional question, consent) next to email; founder to confirm before merge |
| Privacy notice for interest data     | Decision | The site form's consent text names what is collected; counsel to confirm wording and the Formspree processor                                                                               |
| Invited testers' guide               | Done     | `/beta` (`apps/web/src/app/beta/page.tsx`), not indexed                                                                                                                                    |

## B. Account registration readiness

Sign up stays closed until these are Done. Existing accounts sign in as
normal throughout; no flag below affects login.

| Item                                  | Status      | Evidence / next step                                                                                                                                                                                                    |
| ------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API sign up flag                      | Done (off)  | `PUBLIC_REGISTRATION_ENABLED` defaults to `false` (`apps/api/src/config/env.ts`); `POST /auth/register` returns 403 before reading the request (`auth.routes.ts`). Production value Unverified                          |
| Web sign up flag                      | Done (off)  | `NEXT_PUBLIC_REGISTRATION_OPEN` defaults to unset/false (web `Dockerfile` build arg); tests `register-closed.test.tsx`, `landing-closed.test.tsx`                                                                       |
| Mobile sign up flag                   | Done (off)  | `EXPO_PUBLIC_REGISTRATION_OPEN` unset shows "sign up on the web". The mobile form sends no consents, so the API would refuse it even if both flags were on; keep it off until a mobile consent step is built and tested |
| Terms and Privacy required at sign up | Done        | `consentService.validateRegistration` requires TERMS and PRIVACY at their current versions before the account is created; nothing is written on failure                                                                 |
| Web sign up works once opened         | Done        | Consent checkboxes and version checks in `apps/web/src/app/register/page.tsx`; covered by the web register tests                                                                                                        |
| Welcome email on first verification   | Done (code) | #305: sent once, on the first verification, by link or SSO; production `RESEND_API_KEY`, sender domain records and `APP_URL` Unverified                                                                                 |
| Privacy Policy and Terms final        | Decision    | Drafts in `docs/legal/drafts/`; counsel                                                                                                                                                                                 |
| Final document versions set in code   | Not started | `LEGAL_DOCUMENT_VERSIONS` still `0.1-draft` / `0.2-draft` (`packages/validation`)                                                                                                                                       |
| Mobile consent step                   | Not started | Required before `EXPO_PUBLIC_REGISTRATION_OPEN` may be set                                                                                                                                                              |

## C. Health data processing readiness

Genuine gates. Nobody's health data is processed without these.

| Item                                  | Status      | Evidence / next step                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health consent enforced server side   | Done        | `requireCurrentConsent()` on every health router (symptoms, cycle, context, briefs, treatments, notes, MRS, baseline, onboarding, reflections, trends); export stays open                                                                                          |
| Legal basis and consent wording       | Decision    | `docs/legal/consent-decision-sheet.md`, five questions for counsel                                                                                                                                                                                                 |
| HIPAA applicability                   | Decision    | `docs/legal/hipaa-readiness.md`; no HIPAA claims until decided                                                                                                                                                                                                     |
| Personal text encrypted at rest       | Unverified  | Code done (`ENCRYPTION.md`, now including the appointment follow up comment); confirm `DATA_ENCRYPTION_KEY` is set in production and the backfill has run                                                                                                          |
| Sharing a BRIEF with a clinician      | Decision    | Built (`docs/SHARING.md`): link plus separate 6 digit code, hashes only, 7 or 30 days, lock after 5 wrong codes, revocable, audited. Counsel to confirm the in-app wording counts as her instruction to disclose, and whether the shared view needs its own notice |
| AI processor sees summary counts only | Done        | `brief.ai.ts` `BriefInput`; notes, priorities and treatment names never sent; evaluation harness asserts no treatment name reaches the AI input                                                                                                                    |
| BRIEF survives an AI failure          | Done        | Deterministic fallback in this sprint: findings, charts and severity saved, wording marked unavailable, nothing invented                                                                                                                                           |
| Error monitoring                      | Unverified  | `apps/api/src/lib/sentry.ts` reads `SENTRY_DSN`; set it in production                                                                                                                                                                                              |
| Backups and restore drill             | Done        | Restore drill 12 October 2026 (`BACKUPS.md`); repeat quarterly (next due January 2027)                                                                                                                                                                             |
| Branch protection on `main`           | Not started | `scripts/setup-branch-protection.mjs` fixed in #307; not applied (GitHub reported `protected: false` on 1 November)                                                                                                                                                |
| Access review (Railway, GitHub)       | In progress | GitHub: two admins, one writer; review Railway                                                                                                                                                                                                                     |
| Incident response named and rehearsed | In progress | `docs/INCIDENT_RESPONSE.md`; name people, run a tabletop                                                                                                                                                                                                           |
| Dependency scanning                   | Done        | CI blocks high and critical advisories; `main` green after #308                                                                                                                                                                                                    |
| Multi factor sign in                  | Not started | Planned; not required for beta                                                                                                                                                                                                                                     |

## D. Clinical validation

Gates clinical claims and clinical content, not interest collection.
Features already merged without sign off are listed so the review can
cover them in one sitting.

| Item                                          | Status   | Evidence / next step                                                                                           |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Severity week by week grid                    | Decision | Merged in #299 without sign off; wording, 7 day blocks, 4 week blocks past 13 weeks, and the day count display |
| Family and social impact answers              | Decision | Merged in #299 without sign off; answer options and the 7 answered day threshold                               |
| BRIEF wording rules and deny-list             | Decision | `brief.ai.ts` system prompt and `PROHIBITED_PATTERNS`; evaluation harness ready for a clinician rubric pass    |
| AI unavailable notice wording                 | Decision | New in this sprint (EN, FR, JA); confirm it reads as neutral and adds nothing                                  |
| FAQ, Resources, Field Guide, symptom language | Decision | As before: rewritten to make fewer claims; need a menopause clinician                                          |
| Urgent help and escalation language           | Decision | Draft ready; confirm crisis lines per country                                                                  |
| Claims inventory                              | Decision | `planning/claims-inventory.md`; seven fixes and sign off open                                                  |

## E. Commercial launch readiness

| Item                       | Status      | Evidence / next step                                                                                                                         |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity incorporated        | Decision    | Founder                                                                                                                                      |
| Support email operational  | Decision    | info@embrhealthcare.com; confirm who answers and how fast                                                                                    |
| Product analytics          | In progress | Admin dashboard counts only (`METRICS.md`), now with activation, AI reliability and appointment outcome; no third party analytics in the app |
| First cohort defined       | Decision    | Who, how many, how invited                                                                                                                   |
| Medical device positioning | Decision    | Counsel, per market                                                                                                                          |
| Website merged and live    | Decision    | landingpage#10 open                                                                                                                          |

---

The detailed tables below are the October record, kept for history.
Where a row above and a row below disagree, the row above is current.

## Product

| Item                                                   | Status      | Evidence / next step                                                                                                                                                    |
| ------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core record (log, check in, timeline, symptom history) | Done        | Web and mobile suites green; end to end checked locally at 320 to 1440px                                                                                                |
| EMBR BRIEF (generation, PDF, past briefs)              | Done        | Deterministic patterns first, AI wording only; PDF tests green                                                                                                          |
| Night sweats recall                                    | Done        | Morning question (#211), shown on Timeline and BRIEF (#214); never sent to the AI                                                                                       |
| Work impact question                                   | Done        | #225; BRIEF and Timeline only, never sent to the AI or to employers; counsel question 13 open                                                                           |
| Timeline month view and ranked symptom bars            | Done        | #215, #216                                                                                                                                                              |
| Notebook                                               | Done        | #220; cover colour editable, exported, audited by id only, never sent to the AI                                                                                         |
| Display settings (text size, dark mode)                | Done        | Web only (#210, #219); mobile dark mode not built                                                                                                                       |
| Synthetic demo ("Meet Maya")                           | Done        | `maya.html`; synthetic data only, every figure calculated on the page; linked from hero                                                                                 |
| Web QA                                                 | Done        | Visual pass at 320, 375, 768, 1024, 1440px; no overflow or page errors                                                                                                  |
| Mobile QA                                              | In progress | Builds fixed (test files under `app/` broke every build) and screen reader roles added; 56 screens checked at phone widths. Real device script in `MOBILE-DEVICE-QA.md` |
| Accessibility review                                   | In progress | 44px targets, severity readable without colour, focus states; needs a screen reader pass                                                                                |
| EN / JA review                                         | In progress | Copy reviewed in session; needs a native Japanese reviewer before launch                                                                                                |
| Admin and worker deploys                               | In progress | Admin moved to Railway (Dockerfile build) and live on 11 Oct; needs its origin in the API's `CORS_ORIGIN`. Worker moved to its Dockerfile on 11 Oct                     |

## Clinical

| Item                                         | Status      | Evidence / next step                                                                 |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| FAQ reviewed                                 | Decision    | Rewritten to make fewer medical claims; needs a menopause clinician                  |
| Resources and Symptom Library reviewed       | Decision    | Same                                                                                 |
| Field Guide reviewed                         | Decision    | Rewritten without unsourced figures; needs a clinician                               |
| Symptom language reviewed                    | Decision    | App taxonomy and severity words (Mild / Moderate / Severe)                           |
| Escalation and urgent care language reviewed | Decision    | App safety notice and Field Guide section 08                                         |
| Questions for a healthcare provider sheet    | Decision    | Draft in `planning/clinician-content-review.md`; not in the app until signed off     |
| Urgent help box on mood and anxiety          | Decision    | Draft wording ready; needs clinician sign off and confirmed crisis lines per country |
| Claims inventory completed                   | In progress | Inventory in `planning/claims-inventory.md`; seven fixes and clinician sign off open |

## Legal

| Item                                | Status      | Evidence / next step                                                                                               |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Counsel brief answered              | Decision    | 12 questions in `planning/counsel-brief.md`                                                                        |
| Research data use                   | Decision    | Plan in `planning/research-data-plan.md`; nothing built, no data shared                                            |
| Entity incorporated                 | Decision    | Founder                                                                                                            |
| Terms approved                      | Decision    | Draft in `docs/legal/drafts/`; placeholders unresolved                                                             |
| Privacy Policy approved             | Decision    | Draft in `docs/legal/drafts/`; reconcile with the real data flows below                                            |
| Health data consent approved        | Decision    | Wording at `0.2-draft`; consent vs acknowledgement per `docs/legal/consent-decision-sheet.md`                      |
| HIPAA applicability decided         | Decision    | Counsel question 14; readiness and gaps in `docs/legal/hipaa-readiness.md`; no HIPAA claims until decided          |
| Medical device positioning reviewed | Decision    | Site FAQ says EMBR is not a medical device; counsel to confirm for each target market                              |
| Data retention language reviewed    | Decision    | Backups roll off after about 30 days; deletion is immediate in the live service                                    |
| Third party processors reviewed     | In progress | Railway (EU, Amsterdam), Anthropic (BRIEF wording, summary counts only), email provider, Formspree (website forms) |

## Security

| Item                     | Status      | Evidence / next step                                                                                                                                        |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production database      | Done        | Railway Postgres in the EU (Amsterdam)                                                                                                                      |
| Personal text encryption | In progress | Notes, notebook, treatment names and BRIEF wording encrypted in the API (`ENCRYPTION.md`); set `DATA_ENCRYPTION_KEY` in Railway, then run the backfill once |
| Backup verification      | Done        | Daily encrypted backups at 03:00 UTC, 30 day pruning; restore drill passed on 12 October 2026 (see `BACKUPS.md`); repeat quarterly                          |
| Access controls          | In progress | Owner and admin roles in app; review Railway and GitHub access lists                                                                                        |
| Secrets management       | In progress | Railway variables; remove leftover SMTP variables that are no longer used                                                                                   |
| Error monitoring         | Not started | No `SENTRY_DSN` set in production                                                                                                                           |
| Audit logging            | Done        | Auth, consent, symptom, check in and BRIEF events audited                                                                                                   |
| Deletion workflow        | Done        | Account deletion tested end to end                                                                                                                          |
| Data export              | Done        | One JSON file holds the whole record, including onboarding answers and consent history; CSVs and PDF for reading                                            |
| Dependency scanning      | Done        | CI blocks high and critical advisories; documented ignores have removal conditions                                                                          |
| Incident response        | In progress | `docs/INCIDENT_RESPONSE.md` exists; name the people and run a tabletop exercise                                                                             |

## Brand

| Item                               | Status      | Evidence / next step                                                                        |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Founder page                       | In progress | `founder.html` shows `founder.jpg` once the file is uploaded to the website repo            |
| Evidence engine section (website)  | In progress | [landingpage#7](https://github.com/EMBR-Health-Dev/landingpage/pull/7) open for review      |
| About                              | Done        | Record first positioning, "EMBR describes. Your clinician interprets."                      |
| Resources                          | In progress | Hierarchy in place; Menopause 101 and Common terminology marked "in preparation"            |
| Evidence & Research                | In progress | Four part structure live; established / emerging summaries need sources and clinical review |
| Synthetic demo                     | Done        | See Product                                                                                 |
| Brand foundation                   | Done        | `docs/BRAND-FOUNDATION.md`                                                                  |
| Early access flow                  | Done        | "Request early access" email on site and app; sign up closed                                |
| Website branch merged and deployed | Decision    | `landingpage` branch `launch/readiness-pass` not yet merged                                 |

## Launch

| Item                                | Status      | Evidence / next step                                                                     |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Privacy Policy published            | Not started | Final version live at the URL in `LEGAL_DOCUMENT_URLS`                                   |
| Terms published                     | Not started | Same                                                                                     |
| Final document versions set in code | Not started | `LEGAL_DOCUMENT_VERSIONS` matches the published pages                                    |
| Support email operational           | Decision    | info@embrhealthcare.com receives early access requests; confirm who answers and how fast |
| Analytics decision made             | Decision    | Whether to measure anything, and with what, given health data                            |
| First cohort defined                | Decision    | Who, how many, how they are invited                                                      |
| Sign up reopened deliberately       | Not started | Set the three registration flags only after every item above is Done                     |
