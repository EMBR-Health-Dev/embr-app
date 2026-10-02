# EMBR Launch Readiness

The control document for moving EMBR from private early access to real
users. Sign up stays closed (`PUBLIC_REGISTRATION_ENABLED=false`, see
`docs/DEPLOYMENT.md`) until every **Launch** item is ticked, and no
Launch item is ticked until the sections above it are.

Status key: **Done** (verified), **In progress**, **Not started**,
**Decision** (waiting on a person, named where known). Update the date
and the evidence column whenever a status changes.

_Last reviewed: 2 October 2026._

## Product

| Item                                                   | Status      | Evidence / next step                                                                     |
| ------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| Core record (log, check in, timeline, symptom history) | Done        | Web and mobile suites green; end to end checked locally at 320 to 1440px                 |
| EMBR BRIEF (generation, PDF, past briefs)              | Done        | Deterministic patterns first, AI wording only; PDF tests green                           |
| Synthetic demo ("Meet Maya")                           | In progress | Public, synthetic data only; no real health information                                  |
| Web QA                                                 | Done        | Visual pass at 320, 375, 768, 1024, 1440px; no overflow or page errors                   |
| Mobile QA                                              | Not started | Code and tests only; needs a pass on real iOS and Android devices                        |
| Accessibility review                                   | In progress | 44px targets, severity readable without colour, focus states; needs a screen reader pass |
| EN / JA review                                         | In progress | Copy reviewed in session; needs a native Japanese reviewer before launch                 |
| Admin and worker deploys                               | Not started | Latest admin and worker deploys on Railway were failing when last checked                |

## Clinical

| Item                                         | Status      | Evidence / next step                                                                     |
| -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| FAQ reviewed                                 | Decision    | Rewritten to make fewer medical claims; needs a menopause clinician                      |
| Resources and Symptom Library reviewed       | Decision    | Same                                                                                     |
| Field Guide reviewed                         | Decision    | Rewritten without unsourced figures; needs a clinician                                   |
| Symptom language reviewed                    | Decision    | App taxonomy and severity words (Mild / Moderate / Severe)                               |
| Escalation and urgent care language reviewed | Decision    | App safety notice and Field Guide section 08                                             |
| Claims inventory completed                   | Not started | List every factual or medical claim on the site, app and PDFs with its source or removal |

## Legal

| Item                                | Status      | Evidence / next step                                                                                               |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| Entity incorporated                 | Decision    | Founder                                                                                                            |
| Terms approved                      | Decision    | Draft in `docs/legal/drafts/`; placeholders unresolved                                                             |
| Privacy Policy approved             | Decision    | Draft in `docs/legal/drafts/`; reconcile with the real data flows below                                            |
| Health data consent approved        | Decision    | Wording at `0.2-draft`; consent vs acknowledgement per `docs/legal/consent-decision-sheet.md`                      |
| Medical device positioning reviewed | Decision    | Site FAQ says EMBR is not a medical device; counsel to confirm for each target market                              |
| Data retention language reviewed    | Decision    | Backups roll off after about 30 days; deletion is immediate in the live service                                    |
| Third party processors reviewed     | In progress | Railway (EU, Amsterdam), Anthropic (BRIEF wording, summary counts only), email provider, Formspree (website forms) |

## Security

| Item                | Status      | Evidence / next step                                                                |
| ------------------- | ----------- | ----------------------------------------------------------------------------------- |
| Production database | Done        | Railway Postgres in the EU (Amsterdam)                                              |
| Backup verification | In progress | Daily encrypted backups at 03:00 UTC, 30 day pruning; run and record a restore test |
| Access controls     | In progress | Owner and admin roles in app; review Railway and GitHub access lists                |
| Secrets management  | In progress | Railway variables; remove leftover SMTP variables that are no longer used           |
| Error monitoring    | Not started | No `SENTRY_DSN` set in production                                                   |
| Audit logging       | Done        | Auth, consent, symptom, check in and BRIEF events audited                           |
| Deletion workflow   | Done        | Account deletion tested end to end                                                  |
| Dependency scanning | Done        | CI blocks high and critical advisories; documented ignores have removal conditions  |
| Incident response   | In progress | `docs/INCIDENT_RESPONSE.md` exists; name the people and run a tabletop exercise     |

## Brand

| Item                               | Status      | Evidence / next step                                                                             |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| Founder page                       | Done        | `founder.html` on the website branch; portrait to add (`founder.jpg`)                            |
| About                              | Done        | Record first positioning, "EMBR describes. Your clinician interprets."                           |
| Resources                          | In progress | Hero, boundary and grouped Symptom Library done; Menopause 101 and Prepare for Care need content |
| Evidence & Research                | Not started | Needs cited, clinician reviewed summaries; structure agreed                                      |
| Synthetic demo                     | In progress | See Product                                                                                      |
| Early access flow                  | Done        | "Request early access" email on site and app; sign up closed                                     |
| Website branch merged and deployed | Decision    | `landingpage` branch `launch/readiness-pass` not yet merged                                      |

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
