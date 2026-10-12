# EMBR Launch Readiness

The control document for moving EMBR from private early access to real
users. Sign up stays closed (`PUBLIC_REGISTRATION_ENABLED=false`, see
`docs/DEPLOYMENT.md`) until every **Launch** item is ticked, and no
Launch item is ticked until the sections above it are.

Status key: **Done** (verified), **In progress**, **Not started**,
**Decision** (waiting on a person, named where known). Update the date
and the evidence column whenever a status changes.

_Last reviewed: 11 October 2026._ What changed since 2 October is listed in
[`CHANGELOG-2026-10.md`](CHANGELOG-2026-10.md); the working drafts for counsel,
the clinician and the ethics board are in [`planning/`](planning/README.md).

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
| Medical device positioning reviewed | Decision    | Site FAQ says EMBR is not a medical device; counsel to confirm for each target market                              |
| Data retention language reviewed    | Decision    | Backups roll off after about 30 days; deletion is immediate in the live service                                    |
| Third party processors reviewed     | In progress | Railway (EU, Amsterdam), Anthropic (BRIEF wording, summary counts only), email provider, Formspree (website forms) |

## Security

| Item                | Status      | Evidence / next step                                                                                                               |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Production database | Done        | Railway Postgres in the EU (Amsterdam)                                                                                             |
| Backup verification | Done        | Daily encrypted backups at 03:00 UTC, 30 day pruning; restore drill passed on 12 October 2026 (see `BACKUPS.md`); repeat quarterly |
| Access controls     | In progress | Owner and admin roles in app; review Railway and GitHub access lists                                                               |
| Secrets management  | In progress | Railway variables; remove leftover SMTP variables that are no longer used                                                          |
| Error monitoring    | Not started | No `SENTRY_DSN` set in production                                                                                                  |
| Audit logging       | Done        | Auth, consent, symptom, check in and BRIEF events audited                                                                          |
| Deletion workflow   | Done        | Account deletion tested end to end                                                                                                 |
| Data export         | Done        | One JSON file holds the whole record, including onboarding answers and consent history; CSVs and PDF for reading                   |
| Dependency scanning | Done        | CI blocks high and critical advisories; documented ignores have removal conditions                                                 |
| Incident response   | In progress | `docs/INCIDENT_RESPONSE.md` exists; name the people and run a tabletop exercise                                                    |

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
