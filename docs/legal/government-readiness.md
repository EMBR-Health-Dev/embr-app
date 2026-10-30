# Government procurement readiness

_Written 30 October 2026 by engineering, from the code and records in this
repository as of `main` at `d442139`. Not legal advice. Framework facts
from outside sources are cited; anything not checked against a primary
source is marked **unverified**._

## The short answer

EMBR is **not ready for a government contract in any market today**, and no
code change alone makes it ready. Government buyers assess four things,
and EMBR has gaps in each:

1. **Open security incident.** The October 2026 Railway breach is still
   open in `docs/incidents/2026-10-railway-credentials.md`: only the
   reachability check is ticked; no secret rotation is recorded as done,
   and rotating `DATA_ENCRYPTION_KEY` needs code that does not exist yet.
   Every government security questionnaire asks about incidents in the
   last 12 months. This is gate 0.
2. **Certifications.** None held: no Cyber Essentials, ISO 27001, SOC 2,
   DSPT, HDS, ISMAP or FedRAMP.
3. **Clinical safety assurance.** No named Clinical Safety Officer, hazard
   log or safety case (DCB0129 in the UK).
4. **Hosting.** One Railway project in the EU (Amsterdam), one production
   environment, no staging. Each market has its own hosting rules.

The most realistic first government buyer is the **NHS in England**: it is
EMBR's launch market, its requirements are published and achievable for a
small supplier, and much of the work (ISMS, pen test, MFA, clinical safety)
is reused for every other market.

## Which government, which rules

| Market                     | Buyer examples                                       | What is required                                                                                                                                                                                                                                                                                                                                                                                                                                         | EMBR today                                                                                         |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **UK (NHS, councils)**     | ICBs, NHS trusts, GP federations, public health      | **DTAC V2** (from April 2026): DCB0129 clinical safety with a Clinical Safety Officer; **DSPT completed before release**; **ICO registration** (no self-assessment); product transparency information; **Cyber Essentials** plus the **Cyber Security Charter** and **Software Security Code of Practice**; interoperability (APIs). NICE Evidence Standards Framework for evidence. Procurement via G-Cloud (**unverified**: current framework number). | None of the DTAC items is complete. Accessibility review in progress. No API for interoperability. |
| **France (public health)** | Hospitals (GHT), Assurance Maladie, Mon espace santé | **HDS certification** for whoever hosts personal health data for others; HDS v2 (2024) requires storage **only in the EEA**. State bodies may require SecNumCloud for sensitive data (**unverified** for this use). RGAA accessibility. Referencing in Mon espace santé has its own doctrine (**unverified**).                                                                                                                                           | Hosted in the EU, but Railway's HDS status is **unverified and unlikely**. No RGAA audit.          |
| **US federal**             | VA, HHS agencies, DoD health                         | **FedRAMP**: 2026 Consolidated Rules with classes A to D; the 20x path needs no agency sponsor and uses automated security evidence; Rev 5 has a planned end date. **HIPAA** with BAAs, **Section 508** (VPAT / ACR), NIST 800-53 controls.                                                                                                                                                                                                              | EU hosting only, no BAAs, no 508 report, no NIST control mapping. See `hipaa-readiness.md`.        |
| **US states and cities**   | Medicaid programs, state health departments          | **GovRAMP** (StateRAMP was renamed in February 2025), NIST 800-53 based; often SOC 2 Type II as a first step; HIPAA when the buyer is a covered entity.                                                                                                                                                                                                                                                                                                  | As US federal.                                                                                     |
| **Japan (government)**     | Ministries, municipalities                           | **ISMAP**, or **ISMAP-LIU** for low-risk SaaS; both need an ISMS aligned with JIS Q 27001 / 27017. Health information under APPI as special care-required data; MHLW / METI / MIC medical information guidelines (3省2ガイドライン). Whether health self-tracking qualifies as "low impact" is **unverified**.                                                                                                                                           | No ISMS. EU hosting for Japanese users (counsel question 7).                                       |

Sources: NHS DTAC V2 summary (8fold Governance, 30 March 2026); HDS v2
EEA requirement (esante.gouv.fr, 16 May 2024); FedRAMP paths and classes
(Paramify, June 2026, a vendor source; confirm on fedramp.gov before
committing); GovRAMP rename (GovRAMP, 14 February 2025); ISMAP-LIU
(Digital Agency, digital.go.jp, 1 April 2025).

## Controls every government buyer checks

Status: **Met** (built and evidenced in this repository), **Partly**,
**Gap**. Evidence is a file or record in this repository.

| Control                             | Status  | Evidence / gap                                                                                                                                                                                                                      |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incident response                   | **Gap** | Railway incident open; rotation unrecorded; `INCIDENT_RESPONSE.md` has no named people and no tabletop exercise                                                                                                                     |
| Key management and rotation         | **Gap** | One `DATA_ENCRYPTION_KEY`, no rotation support (incident record, section 6)                                                                                                                                                         |
| Multi factor authentication         | **Gap** | None for users or the admin console (`hipaa-readiness.md`)                                                                                                                                                                          |
| Enterprise SSO                      | Partly  | OIDC only (`SsoProtocol` enum); many public bodies require SAML                                                                                                                                                                     |
| Environment separation              | **Gap** | One `production` Railway environment, no staging (`DEPLOYMENT.md`)                                                                                                                                                                  |
| Security monitoring                 | **Gap** | Sentry supported, `SENTRY_DSN` not set; no central log retention or alerting                                                                                                                                                        |
| Encryption in transit and at rest   | Partly  | TLS everywhere; field encryption of personal text; encrypted backups. Disk level encryption of the Railway database is **unverified**                                                                                               |
| Audit logging                       | Met     | Append only `AuditLog`, kept after account deletion. No review process or export for a customer                                                                                                                                     |
| Access control and tenant isolation | Met     | Ownership scoped queries (`IDOR-AUDIT.md`); employer views aggregated with a k-anonymity floor; static tests keep context data out of organisation code (they match names, not raw SQL; admin metrics SQL reads only ids and dates) |
| Backup and recovery                 | Partly  | Daily encrypted backups, restore drill passed 12 October; no written RTO / RPO; backup key rotation pending (incident)                                                                                                              |
| Vulnerability management            | Partly  | Dependabot, `pnpm audit` gate, gitleaks in CI, `SECURITY.md` disclosure policy. No SAST, container scanning, SBOM or independent penetration test                                                                                   |
| Accessibility                       | Partly  | 44px targets, severity readable without colour, focus states; no screen reader pass, no WCAG 2.2 AA audit, no VPAT / ACR                                                                                                            |
| Data residency                      | Partly  | EU only. Fine for UK and France (if HDS); not for US federal; Japan open                                                                                                                                                            |
| Subprocessors and agreements        | **Gap** | Railway, Anthropic, Resend, Formspree, Stripe: DPAs not recorded as signed (counsel question 9); no BAAs                                                                                                                            |
| Information security management     | **Gap** | No ISMS, risk register, named security officer, policies, staff training or vetting record                                                                                                                                          |
| Clinical safety                     | **Gap** | Deterministic clinical logic and AI boundary are documented and tested, but no CSO, hazard log, safety case or clinical risk management plan                                                                                        |
| AI data boundary                    | Met     | Only computed counts reach Anthropic; notes, priorities, treatment names, work and family impact never do (tested)                                                                                                                  |

## Recommended order

Each step is reused by the ones after it.

**0. Close the Railway incident (now, founder).** Work the rotation
checklist and record each step. Engineering builds key rotation support
for `DATA_ENCRYPTION_KEY` and `SSO_ENCRYPTION_KEY` first, since the
checklist depends on it.

**1. Foundations (November to December 2026).**

- Engineering: MFA (mandatory for admins), key rotation, a staging
  environment, Sentry with health data scrubbed, SAST and an SBOM in CI.
- Founder: name a security officer and a Clinical Safety Officer; write
  the core policies; sign the subprocessor DPAs; register with the ICO.
- Cyber Essentials, then Cyber Essentials Plus. Small, fast, and required
  for UK public sector work.

**2. NHS ready (Q1 2027).** DSPT submission, DCB0129 safety case and hazard
log, independent penetration test, WCAG 2.2 AA audit, DTAC V2 submission,
product transparency page, G-Cloud listing.

**3. ISO 27001 (2027).** The ISMS built in step 1 becomes certifiable. It
is the base for ISMAP (Japan) and helps with HDS and US questionnaires.

**4. Market by market, only with a buyer in view.**

- France: move hosting to an HDS certified EEA provider. This is an
  architecture decision, not a setting.
- US: SOC 2 Type II, then a separate US deployment with BAAs; FedRAMP 20x
  only with a federal buyer in the pipeline.
- Japan: ISMAP-LIU after ISO 27001, if counsel confirms eligibility.

## Decisions for the founder

1. Confirm the Railway rotation status, and approve building key rotation
   support before any other engineering work.
2. Choose the first government market. Recommendation: NHS England.
3. Name the security officer and the Clinical Safety Officer (the CSO must
   be a registered clinician).
4. Budget for an independent penetration test and Cyber Essentials Plus.
5. France: accept that public sector work there means moving hosting to an
   HDS certified provider.
