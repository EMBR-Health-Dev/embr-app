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
