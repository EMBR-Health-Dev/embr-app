# 2026-10: Railway platform incident, credential rotation

Status: **open**. Decision owner: the founder (see `docs/INCIDENT_RESPONSE.md`).

## What happened (from Railway)

Source: Railway, "Preliminary Report: Oct 21st Security Incident"
(blog.railway.com, published 2026-10-22).

- An attacker was inside Railway's internal systems from 2026-10-20 13:58
  UTC to 2026-10-22 03:32 UTC.
- They queried stored environment variables, and decrypted a subset. Railway
  cannot say which variables in which projects were decrypted.
- They were after AI provider API keys. Railway passed keys to vendors
  (Anthropic, Stripe, GitHub and others) for revocation; some vendors
  revoked every key Railway held.
- Railway says user accounts were not logged into, running services stayed
  up, and it rolled the credentials of every storage bucket. It has not
  ruled out access to source code.
- Railway advises everyone who signed up before October 21 to rotate every
  secret stored on Railway.

## What this means for EMBR

Treat every variable stored on Railway before October 21 as known to the
attacker. EMBR has not been told it was directly affected, and there is no
evidence anyone read EMBR's database or backups.

| Secret                                                     | If someone has it, they can                                                                  | Priority                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------ |
| `ANTHROPIC_API_KEY`                                        | Spend on EMBR's account. This is what the attacker was looking for.                          | Now                            |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                  | Forge a session for any user and read her record through the API                             | Now                            |
| `RESEND_API_KEY`                                           | Send email that looks like it comes from EMBR (phishing testers)                             | Now                            |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`               | Act on the Stripe account; fake billing events                                               | Now                            |
| Backup bucket credentials + `BACKUP_ENCRYPTION_KEY`        | Download and open backups. Backups up to 2026-10-17 hold notes and BRIEF wording unencrypted | Now                            |
| Postgres and Redis passwords (`DATABASE_URL`, `REDIS_URL`) | Nothing from outside **while the databases have no public endpoint**                         | Today                          |
| `DATA_ENCRYPTION_KEY`                                      | Read encrypted notes, but only together with a copy of the database or a backup              | This week, needs a code change |
| `SSO_ENCRYPTION_KEY`                                       | Read organisations' SSO client secrets, with a database copy                                 | With the data key              |
| `SENTRY_DSN`                                               | Send junk error reports                                                                      | Low                            |

The real exposure path for health data is the backups: the bucket
credentials and the backup key were both Railway variables. Whether anyone
used them in the window is the main open question (see "Questions for
Railway").

## Clock log

Times in UTC. Add a line for every step.

| When                | What                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-10-20 13:58    | Railway incident window starts                                                                                |
| 2026-10-21          | Railway publishes its disclosure and emails customers                                                         |
| 2026-10-22 03:32    | Railway confirms the attacker no longer has access                                                            |
| 2026-10-23 (time: ) | EMBR founder reviews the notice; rotation starts (fill in exact time)                                         |
| 2026-10-23          | Postgres and Redis confirmed private (no public access)                                                       |
| 2026-10-23          | Anthropic console: no spend since 2026-10-11, so no sign the key was used during or after the incident window |
| 2026-10-24          | New Anthropic key being created ("embr prod v2", Default workspace). Not yet confirmed set in Railway         |
| 2026-10-24          | New JWT secret values generated. Not yet confirmed set in Railway                                             |
| 2026-10-24          | GitHub repository secrets reviewed: only `PRODUCTION_DATA_ENCRYPTION_KEY` exists                              |

## Rotation checklist

Work top to bottom. Save each new value in the password manager **before**
setting it in Railway. Generate random secrets with `openssl rand -base64 48`
(or `-base64 32` where a 32-byte key is required).

### 1. Check what is reachable from the internet

- [x] Postgres service, **Settings > Networking**: no TCP proxy, no public
      domain. If one exists, remove it.
- [x] Redis service: the same.
- [x] Result (2026-10-23): neither has public access. Both Networking pages
      offer only "Add public access", and no `DATABASE_PUBLIC_URL` or
      `REDIS_PUBLIC_URL` is set. Reachable only on Railway's private
      network, so the leaked passwords alone give no way in.

### 2. Provider keys (rotate at the provider, then paste into Railway)

- [x] **Anthropic**, usage: no spend since 2026-10-11 (checked 2026-10-23).
- [ ] **Anthropic**, key: create a new key, set `ANTHROPIC_API_KEY` on
      `@embr/api`, deploy, delete the old key, then generate a BRIEF and see
      its spend appear in the same console. If Anthropic already revoked the
      old key, BRIEF generation is failing until this is done. (Started
      2026-10-24.)
- [ ] **Resend**: check the sending log for mail EMBR did not send, delete the
      old key, create a new one, set `RESEND_API_KEY`.
- [ ] **Stripe**: roll the secret key (Developers > API keys) and the webhook
      signing secret (Developers > Webhooks), set both on `@embr/api`, check
      the Stripe event log since 2026-10-20.
- [ ] **Sentry**: optional, rotate the DSN.

### 3. Session secrets (signs every user out once)

- [ ] New `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` on `@embr/api`, then
      deploy. Only the API reads these (`apps/api/src/modules/auth/tokens.ts`);
      web and admin reach the API through their proxy, so they need no change.
      (Values generated 2026-10-24.)
- [ ] After the redeploy, sign in again on web and on the phone.

### 4. Database and Redis passwords

- [ ] Postgres: regenerate the password from the Postgres service (Railway's
      rotation guide). Services that reference `${{Postgres.DATABASE_URL}}`
      pick it up on redeploy; redeploy `@embr/api`, the worker and the backup
      service.
- [ ] Redis: the same for `REDIS_URL`.
- [ ] Health check: `https://app.embrhealthcare.com` signs in and loads a
      record.

### 5. Backups

- [ ] Railway says it rolled every bucket's credentials. Confirm the backup
      service's `AWS_*` variables are references to the `embr-backups`
      bucket (not pasted values), redeploy it, and confirm tomorrow's 03:00
      backup lands.
- [ ] New `BACKUP_ENCRYPTION_KEY` on the backup service. **Keep the old key**
      in the password manager, labelled with the dates it covers: every
      backup taken before today still needs it.
- [ ] Decide whether to delete backups from before 2026-10-17 (the ones with
      unencrypted notes) once a new-key backup has been restore-tested.

### 6. Data and SSO encryption keys

The app reads only one `DATA_ENCRYPTION_KEY`, so replacing it would make
every encrypted note unreadable. Rotating it needs a small change first: the
API reads with the old or new key and writes with the new one, and a script
re-encrypts every row (the same pattern as the encryption backfill). Do not
change `DATA_ENCRYPTION_KEY` in Railway until that change is deployed.

- [ ] Ship key rotation support, then rotate `DATA_ENCRYPTION_KEY` and
      re-encrypt.
- [ ] `SSO_ENCRYPTION_KEY`: if no organisation has SSO set up, replace it
      directly. If one does, rotate it with the same change.

### 7. GitHub

- [ ] github.com > Settings > Applications: review the Railway app's access
      to `EMBR-Health-Dev`. Railway re-issued every GitHub App installation.
- [ ] Organisation audit log (Settings > Audit log) from 2026-10-20: look for
      new deploy keys, tokens, collaborators, or pushes nobody made.
- [x] Repository secrets reviewed (2026-10-24): the only one is
      `PRODUCTION_DATA_ENCRYPTION_KEY`. None of the other `PRODUCTION_*` or
      `BACKUP_*` secrets the workflows name exist, so there is nothing to
      update after rotating.
- [ ] Delete `PRODUCTION_DATA_ENCRYPTION_KEY` from GitHub. No workflow can
      use it: GitHub's runners cannot reach the private database, and the
      backfill was run through `railway ssh` instead. Removing it leaves the
      key only in Railway and the password manager.

### 8. Railway account

- [ ] Railway signed everyone out. Sign in again and turn on two-factor
      authentication if it is not on.
- [ ] Recreate any Railway API tokens (the Railway CLI and the claude.ai
      Railway connector both need re-authorising).

## Follow ups found during the incident

- The weekly "Retention Cleanup" GitHub workflow fails every run: its
  secrets were never added, and it cannot reach the private database
  anyway. It only deletes expired sessions and tokens, so nothing is at
  risk, but it should move into Railway as a cron service, the same way the
  daily backup runs.

## Questions for Railway (support@railway.com)

1. Was workspace/project `7d72709e-08c7-4793-80ba-305b92ee9bc8` among the
   workspaces whose variables were decrypted?
2. Are there access logs for the `embr-backups` bucket between 2026-10-20
   13:58 and the time its credentials were rolled? Any object reads?
3. When exactly were that bucket's credentials rolled?

The answers decide the notification question below.

## Notification decision

Health information is special care-required personal information under
APPI and special-category data under GDPR. The test is whether personal
data was, or may have been, leaked, not whether a key was. Today, nothing
shows EMBR's database or backups were read. Record the decision and the
reason here, with counsel, once Railway answers. If Railway confirms EMBR's
variables were decrypted, or the bucket shows reads EMBR did not make,
treat it as a possible leak and follow `docs/INCIDENT_RESPONSE.md`
(PPC report in Japan; 72 hours under GDPR/UK GDPR for users there).

Decision: \_\_\_ Date: \_\_\_ Reason: \_\_\_
