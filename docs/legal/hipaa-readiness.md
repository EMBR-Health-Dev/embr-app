# HIPAA readiness

_Written 30 October 2026 by engineering, from the code as of that date._
_Not legal advice. Whether HIPAA applies to EMBR is counsel's decision
(counsel brief, question 14)._

## The short answer

**EMBR cannot honestly be called "HIPAA compliant" today, and code alone
cannot make it so.** HIPAA compliance is mostly contracts, policies and
people: signed business associate agreements, a written risk analysis, a
named security official, training and breach procedures. Engineering can
supply the technical safeguards, and most of them already exist.

**HIPAA very likely does not apply to EMBR yet.** HIPAA binds covered
entities (US health plans, clearinghouses, and providers who bill
electronically) and their business associates. A woman keeping her own
record in a consumer app, and choosing to hand a BRIEF to her clinician,
does not make EMBR either. EMBR launches in the UK, France and Japan, with
data hosted in the EU. The laws that apply first are **UK GDPR, EU GDPR
(health is special category data) and Japan's APPI**.

**HIPAA would apply** if EMBR:

- is offered to employees through a US employer's group health plan, or
  paid for by a US health plan;
- is used by a US clinic, hospital or telehealth provider for its own
  patients (for example, clinicians reading BRIEFs inside EMBR on the
  provider's behalf);
- receives records from a US covered entity (EHR import).

Any of these makes EMBR a business associate for that customer, and the
gaps below must be closed **before** that contract is signed.

**Even without HIPAA, US users bring other rules:** the FTC Health Breach
Notification Rule covers consumer health apps outside HIPAA, and state
laws such as Washington's My Health My Data Act regulate consumer health
data. Counsel should cover these in the same answer.

### What to say until counsel answers

> EMBR is built for the UK, France and Japan, and our data is hosted in
> the EU, so GDPR and Japan's privacy law apply first. Our counsel is
> confirming our obligations in each market. Our safeguards include
> encryption of personal text, encrypted and tested backups, audit
> logging of every change to health data, data export and deletion on
> request, and only computed counts sent to the AI that words the BRIEF.

Never "HIPAA compliant" and never "HIPAA certified" (there is no such
certification). `BRAND-FOUNDATION.md` already bans HIPAA claims.

## Technical safeguards (45 CFR 164.312)

Status: **Met** (built and tested), **Partly**, **Gap**. "Addressable"
specifications must be met or a documented alternative chosen.

| Standard                        | Specification                     | Status | Evidence / gap                                                                                                                                                                                        |
| ------------------------------- | --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access control                  | Unique user identification        | Met    | One account per email; every row scoped by `userId`; IDOR audit (`docs/IDOR-AUDIT.md`)                                                                                                                |
|                                 | Emergency access procedure        | Gap    | No documented break glass procedure for operators. Write one (who may access production data, how, and how it is logged)                                                                              |
|                                 | Automatic logoff (addressable)    | Partly | Access tokens expire after 15 minutes; refresh tokens rotate and expire after 30 days unused. Decide whether 30 days idle is acceptable for health data, and document the choice                      |
|                                 | Encryption and decryption (addr.) | Partly | AES-256-GCM on notes, notebook, treatment names, BRIEF wording and priorities (`docs/ENCRYPTION.md`). **`DATA_ENCRYPTION_KEY` is not yet set in production, so production text is not yet encrypted** |
| Audit controls                  |                                   | Met    | Append only `AuditLog` for auth, every health data write, BRIEF generation and download, export and admin views; kept after account deletion                                                          |
| Integrity                       | Authenticate ePHI (addressable)   | Met    | GCM authentication tags reject altered ciphertext; daily encrypted backups with a restore drill (12 October 2026, `docs/BACKUPS.md`)                                                                  |
| Person or entity authentication |                                   | Partly | Argon2id passwords, SSO for organisations, verified email before BRIEFs. **No multi factor authentication**, for users or for the admin console                                                       |
| Transmission security           | Integrity controls, encryption    | Met    | HTTPS everywhere, including to Anthropic; helmet security headers (HSTS)                                                                                                                              |

Fixed on 30 October 2026: error reports to Sentry now drop request headers
(the mobile bearer token travels there) and keep only the account id, never
email or IP address (`apps/api/src/lib/sentry.ts`, `apps/worker/src/sentry.ts`).

## Administrative safeguards (164.308) and physical safeguards (164.310)

These are founder and counsel work; none can be closed in code.

| Requirement                             | Status | Next step                                                                                                                          |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Security risk analysis                  | Gap    | Written risk analysis of every system holding health data; the data inventory in `planning/counsel-brief.md` is the starting point |
| Risk management plan                    | Gap    | Each risk from the analysis with an owner and a fix or an accepted reason                                                          |
| Named security official                 | Gap    | The founder, until someone else is named, written down                                                                             |
| Workforce security, training, sanctions | Gap    | Short written policy and annual training record for anyone with production access                                                  |
| Information system activity review      | Partly | Audit log exists; no one reviews it. Monthly review of admin and export events                                                     |
| Security incident procedures            | Partly | `docs/INCIDENT_RESPONSE.md` exists; needs named people, a tabletop run, and error monitoring on                                    |
| Contingency plan (backup, recovery)     | Partly | Daily encrypted backups and a passed restore drill; add a written recovery time target                                             |
| Periodic evaluation                     | Gap    | Repeat this review yearly and after any major change                                                                               |
| Business associate agreements           | Gap    | See below                                                                                                                          |
| Facility and workstation security       | Partly | Hosting is Railway's; founder laptops need disk encryption, screen lock and a written device policy                                |

## Vendors that would need a BAA

If HIPAA ever applies, every vendor that stores or receives health data
must sign a business associate agreement first. Availability changes, so
each must be confirmed with the vendor in writing.

| Vendor    | What it receives                                     | BAA needed | Notes                                                                                                                                                          |
| --------- | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway   | The whole database and backups                       | Yes        | Confirm whether Railway signs BAAs and on which plan. If not, US health data would need a host that does (AWS, Google Cloud and Azure all offer BAAs)          |
| Anthropic | Computed counts and patterns for BRIEF wording       | Yes        | Anthropic offers BAAs for eligible API use; confirm eligibility and any zero data retention requirement                                                        |
| Resend    | Email addresses                                      | Probably   | Emails carry nothing from her record (`docs/WEEKLY-EMAIL.md`), but an address tied to a health service can itself count as protected; confirm BAA availability |
| Sentry    | Error reports (now without bodies, headers or email) | Probably   | Confirm BAA availability on the plan, or keep events free of health data and document it                                                                       |
| Formspree | Website form submissions                             | Depends    | Only if forms ever collect health information; today they collect early access requests                                                                        |
| Stripe    | Organisation billing only                            | No         | Payment processing for organisations; no health data                                                                                                           |

## What engineering will build next, if HIPAA becomes relevant

In order of value:

1. **Multi factor authentication** (TOTP with recovery codes), mandatory
   for admin accounts, optional for users. Also strengthens the GDPR
   position today.
2. **Session policy**: a decided idle timeout and an absolute session
   lifetime, documented as the automatic logoff choice.
3. **Audit review screen** in the admin console for admin, export and
   failed login events, with a monthly review record.
4. **US data residency**: a separate US deployment on a BAA covered host,
   if US covered entities become customers, rather than mixing US health
   data into the EU database.

## Actions for this week

1. Founder: set `DATA_ENCRYPTION_KEY` in production and run the backfill
   (`docs/ENCRYPTION.md`). This is the single biggest real gap.
2. Founder: send counsel question 14 (added to `planning/counsel-brief.md`).
3. Founder: stop saying "HIPAA compliant"; use the wording above.
4. Founder: decide whether a US launch or US employer sales are in the
   next 12 months. If not, HIPAA work after item 1 can wait for counsel.
