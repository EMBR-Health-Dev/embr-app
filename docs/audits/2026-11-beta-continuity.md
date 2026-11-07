# Beta continuity audit, November 2026

Against `main` at `15b57e9`, 2 November 2026. Code only: production
configuration (Railway variables, the live site) could not be reached
from the review environment, so production values are marked
unverified. No setting was changed.

## 1. Registration

### The three flags

| Flag                            | Where           | Default         | When off                                                                                                       | When on                                                                             |
| ------------------------------- | --------------- | --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `PUBLIC_REGISTRATION_ENABLED`   | API (runtime)   | `false`         | `POST /auth/register` answers `403 REGISTRATION_CLOSED` before validation, so nothing from the request is read | Registration runs, with the consent checks below                                    |
| `NEXT_PUBLIC_REGISTRATION_OPEN` | Web (build arg) | unset (`false`) | `/register` shows early access by email; login links to early access                                           | `/register` shows the form with Terms, Privacy and health consent checkboxes        |
| `EXPO_PUBLIC_REGISTRATION_OPEN` | Mobile (build)  | unset (`false`) | Register screen sends people to web sign up                                                                    | Shows a form that sends **no consents**: the API refuses it with a validation error |

The API flag is the only enforcement point. The web and mobile flags
only decide what the screen shows; a web build with its flag on still
gets 403 from an API with its flag off.

### Findings

- **Beta interest collection is available.** While sign up is closed,
  web `/register`, the login page and the invite page offer early access
  by email (`EARLY_ACCESS_HREF`); the website offers the same.
  landingpage#10 would add a waitlist form beside it; it removes no
  route to sign up, because none is open.
- **Existing users can log in.** Login (password, email link, SSO) does
  not read any registration flag.
- **Registration cannot bypass required consent.** `validateRegistration`
  requires TERMS and PRIVACY at their current versions before the
  account is created, in the same transaction as the consent records.
  HEALTH_PROCESSING is required at sign up only when
  `CONSENT_HEALTH_REQUIRED_AT_REGISTRATION` is on (a counsel decision);
  either way every health route runs `requireCurrentConsent()`, so no
  health data is recorded until the health item is current.
- **SSO creates accounts while sign up is closed.** For an organization
  with an enabled SSO connection, a first SSO sign in provisions an
  account (`sso.service.ts`, just in time) without reading
  `PUBLIC_REGISTRATION_ENABLED`, and without Terms or Privacy records.
  It cannot reach health data: `requireCurrentConsent()` requires all
  three consent items to be current, so the person is sent through the
  consent screen first. `docs/DEPLOYMENT.md` says invites never create
  accounts, which stays true; SSO is a separate path it does not
  mention. Founder decision: whether SSO provisioning should follow the
  sign up flag. Not changed here.
- **Mobile registration stays disabled.** Its flag is off by default,
  and its form sends no consents, so even with every flag on the API
  would refuse it. Keep the flag off until a mobile consent step is
  built and tested.
- **The web flow works once legally approved.** Consent checkboxes,
  version checks and the error paths are covered by the web register
  tests; the welcome email (#305) is sent once on first verification.

### Actual sign up blockers

None in code. Sign up is closed **by configuration, deliberately**,
until the legal documents are final (`docs/DEPLOYMENT.md`, "Sign up").
Reopening is a founder decision: set the final `LEGAL_DOCUMENT_VERSIONS`
and `LEGAL_DOCUMENT_URLS`, then the API and web flags, and rebuild web.
Production values are unverified; a read-only check that creates
nothing: `curl -s -X POST https://<api>/auth/register -H 'content-type: application/json' -d '{}'`
answers 403 `REGISTRATION_CLOSED` when closed and 400 when open.

## 2. Analytics

There is no third party analytics in the app. The admin dashboard
(`admin.metrics.ts`, `docs/METRICS.md`) counts rows and never reads
content.

| Question                          | Before this sprint | Now                                                        |
| --------------------------------- | ------------------ | ---------------------------------------------------------- |
| Registration to first symptom log | Not measured       | "First log in 48 hours", cohort signed up 2 to 30 days ago |
| Seven logging days within 14      | Not measured       | "7 of first 14 days", cohort signed up 14 to 55 days ago   |
| BRIEF generation                  | Measured           | Unchanged (7 and 30 days, downloads, people with a BRIEF)  |
| Appointment outcome feedback      | Not measured       | Answer counts per option, all time                         |
| Week four retention               | Measured           | Unchanged                                                  |

## 3. Appointment outcome: the smallest private design

- **One question per BRIEF**, shown under a past BRIEF when she opens
  it: "Did your EMBR BRIEF help you communicate your symptoms or
  concerns during your appointment?" Five answers, including "I have not
  had an appointment yet". She can change it any time.
- **Optional comment, 500 characters**, with a note asking for no
  medical details. Encrypted at rest, never sent to the AI, never logged
  or audited (the audit log records the answer code only), never shown
  on the admin dashboard, included in her data export, deleted with the
  BRIEF or her account.
- **No new tracking**: no email nudge, no third party, no timing data.
  Behind the same login and health consent as the BRIEF.

Deliberately not built (founder decisions): a reminder after the
appointment (an email can say nothing about health; the reminder email
rules apply), and the same card on mobile.
