# Incident Response

A skeleton runbook — deliberately short. The goal during a real incident
is a checklist you can follow at 3am, not a document you have to
interpret.

## Severity levels

| Level | Definition                                                           | Example                                                     |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| SEV1  | Platform down or a data-integrity/security issue affecting all users | API returning 500s platform-wide; a leaked credential       |
| SEV2  | Major feature broken for a meaningful subset of users, no data risk  | Symptom export broken; login failing for one auth provider  |
| SEV3  | Minor, workaround exists, no user-facing urgency                     | Slow trends endpoint; a non-critical background job failing |

## First 5 minutes (any SEV1/SEV2)

1. Check `/health/ready` on the affected environment — confirms whether
   this is the app, or its Postgres/Redis dependencies.
2. Check Sentry for the relevant service (`embr-api` / `embr-worker`) —
   the error's stack trace and frequency graph is usually faster than
   reasoning from symptoms alone.
3. Check the platform status page for wherever this is deployed
   (Railway/Fly/Vercel status page, and your Postgres/Redis provider's) —
   rules out "this is actually an upstream outage" before you spend time
   debugging application code that isn't broken.
4. If it's a SEV1: post a short status update wherever users/stakeholders
   would look for one, even if it's just "we're aware, investigating" —
   silence during a visible outage is worse than an update with no ETA
   yet.

## Data-integrity or security incidents specifically

- Do not restore over the live database as a first response — take a
  fresh backup of the _current_ (possibly-affected) state first via
  `scripts/db-backup.sh`, so you have both the before and after state to
  compare, before touching anything.
- If credentials may be exposed (leaked `.env`, a committed secret
  caught by gitleaks after the fact, a compromised dependency): rotate
  the credential immediately, don't wait to confirm exploitation first —
  rotation is cheap, a confirmed breach is not.
- If patient health data may have been exposed or altered: this needs a
  deliberate decision on notification obligations from whoever owns that
  call for EMBR — not something to resolve unilaterally mid-incident.
  Note the incident, the suspected scope, and the timeline as you go,
  even before that decision is made.

## Notification obligations and decision owner

EMBR processes health information for users in the EU, the UK, and Japan.
Regulators in each place set short clocks that start when EMBR becomes
_aware_ of a personal data breach, so the decision cannot wait for a full
investigation. The summary below is an engineering checklist, not legal
advice. Counsel should confirm the exact thresholds and wording before
this runbook is treated as final.

- **Decision owner**: the founder decides whether and when to notify.
  Record the name and a backup contact here before beta: `TBD`.
- **Start a clock log immediately**: write down the time EMBR first
  became aware, what is known, and what is not yet known.
- **EU (GDPR Art. 33 and 34)**: notify the competent supervisory authority
  without undue delay and, where feasible, within 72 hours of becoming
  aware, unless the breach is unlikely to risk people's rights and
  freedoms. Health data is special-category data, so assume a risk and
  assess whether affected people must be told directly (Art. 34).
- **UK (UK GDPR)**: the same 72-hour test applies, with the report made to
  the ICO.
- **Japan (APPI)**: a leak of special care-required personal information
  (which includes health information) generally requires a prompt initial
  report and a later final report to the Personal Information Protection
  Commission, plus notice to the people affected. Counsel to confirm the
  current deadlines.
- **Processors to contact if their systems are involved**: the hosting,
  email, and AI providers listed in `docs/acquisition/architecture.md`.
  Record a security contact for each here before beta: `TBD`.
- **Preserve evidence**: keep logs, the pre-change database backup, and
  the timeline notes. Do not delete anything to "clean up" during the
  incident.

## During the incident

- One person drives (makes changes); everyone else investigates and
  reports findings to the driver, rather than multiple people changing
  things simultaneously.
- Timestamp what you try and what happened, even in a scratch doc — this
  becomes the postmortem input, and reconstructing "what did we already
  rule out" from memory afterward is worse than just writing it down as
  you go.

## After

- Write a short postmortem: what happened, timeline, root cause,
  what fixes this specific issue, what (if anything) fixes the class of
  issue. Blameless — the point is the system, not who was on call.
- If the fix is a code change, it goes through the normal CI/PR path
  (`.github/workflows/ci.yml`) like anything else — an incident is not
  a reason to skip lint/test/security-scan on the fix.
- Add a monitoring/alert for this specific failure mode if one didn't
  already exist and would have caught it sooner.
