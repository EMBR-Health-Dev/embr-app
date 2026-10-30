# Founder operating plan, November and December 2026

_Written 29 October 2026, after the product conversation with Michelle._
_A draft for the founder; nothing here is a published claim, a price or
clinical sign off._

The question every item answers: does this make a woman's menopause
experience visible, measurable and actionable in a clinical conversation?
If not, it waits until after January 2027.

## The five decisions

1. **The BRIEF is the flagship.** Everything else (check in, timeline,
   context, notebook) exists to make the BRIEF better.
2. **The taxonomy grows from clinician feedback, and stays closed.** New
   symptoms are named, translated, reviewed categories. No free text
   symptom that the pattern engine cannot count (see
   `embr-clinical-logic`).
3. **A small network of named clinical contributors**, built on concrete
   contributions before any title or equity.
4. **Price and retention are tested before they are decided.** No
   published pricing (`BRAND-FOUNDATION.md`).
5. **Data governance before scale.** No compliance claim EMBR has not had
   confirmed by counsel.

## Where the product already is

Michelle's feedback lands on a product that already does more than the
meeting notes assume. Before building, the plan checks what exists.

| Feedback                          | Already in EMBR                                                                          | Gap                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Export all personal data          | Done: one JSON with the whole record, CSVs and PDF                                       | Keep it free on every tier                                     |
| Organised information for doctor  | Done: BRIEF, deterministic patterns, AI wording only                                     | Her own priorities are not in it                               |
| Timeline and history              | Done: month view, ranked bars, per symptom history                                       | None                                                           |
| Painful sex apart from dryness    | **Added 29 October** (`PAINFUL_SEX`)                                                     | Clinician sign off on the wording                              |
| Anger; mental health past anxiety | **Added 29 October** (`ANGER`, `IRRITABILITY`, `LOW_MOOD`)                               | Same; urgent help box on low mood needs sign off before launch |
| Lifestyle, positive and negative  | Partly: sleep, afternoon caffeine, alcohol, stress, exercise, work impact (`ContextLog`) | Nutrition, social connection, a stress practice                |
| Custom symptoms                   | `OTHER` with a note                                                                      | Deliberately not built: see below                              |
| Functional impact                 | Work impact question, night sweats recall                                                | Family and social impact                                       |

### Why no free text custom symptoms

A custom symptom the engine cannot name cannot be counted, compared
across periods or explained in a BRIEF without guessing. Instead:

- `OTHER` plus a note stays the escape hatch, and its notes stay out of
  the AI, as today.
- Every quarter, the founder and clinical lead read the `OTHER` notes
  (with consent, in aggregate) and promote recurring ones into named
  categories, the way painful sex and anger were promoted this week.

That is the "custom symptom" story for clinicians and investors: the
taxonomy learns from women, through review, not at runtime.

## Product backlog

Owners: **F** founder, **E** engineering (Claude sessions), **C** clinical
lead, **M** Michelle, **L** counsel.

| #   | Item                                                                                                                                                                       | Owner   | Target | Status                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | --------------------------------- |
| P1  | Taxonomy: painful sex, irritability, anger, low mood, in EN, FR, JA, web, mobile, BRIEF PDF                                                                                | E       | 29 Oct | Built, PR                         |
| P2  | Clinical lead signs off the four new names and their FR and JA wording                                                                                                     | C       | 8 Nov  | Not started                       |
| P3  | BRIEF "your priorities": up to three things she most wants her clinician to understand, printed first, encrypted like notes, never sent to the AI                          | E       | 15 Nov | Built, PR                         |
| P4  | BRIEF "questions to discuss" section, using the signed off questions sheet                                                                                                 | E, C    | 22 Nov | Blocked: questions sheet sign off |
| P5  | Context: three positive, optional daily questions: ate in a way that supported her, felt connected to someone, did something that eased stress. Yes or no, never free text | E, C    | 29 Nov | Not started                       |
| P6  | Functional impact: one weekly question on family and social life, kept apart from employer statistics like work impact                                                     | E, C, L | 6 Dec  | Not started                       |
| P7  | MRS BRIEF section, once the licence is confirmed                                                                                                                           | F, E    | Dec    | Blocked: licence                  |
| P8  | Quarterly review of `OTHER` notes for new categories                                                                                                                       | F, C    | Jan    | Not started                       |

Rules for P3 to P6: each one is a fixed field the pattern engine can
count; nothing is free text unless it is hers alone (like priorities) and
then it never reaches the AI. Six lifestyle pillars are a design lens, not
six questionnaires; the existing context questions already cover sleep,
substances, stress and movement.

## Clinical credibility

| #   | Item                                                                                                | Owner | Target |
| --- | --------------------------------------------------------------------------------------------------- | ----- | ------ |
| C1  | Send Michelle the follow up (draft below)                                                           | F     | 31 Oct |
| C2  | Receive the 2 to 3 minute video; agree written permission for app and LinkedIn use                  | F, M  | 15 Nov |
| C3  | Webinar: ask whether EMBR can be a supporting organisation or join the Q&A                          | F     | 8 Nov  |
| C4  | Invite Michelle to review the four new symptoms and the priorities section                          | F, M  | 20 Nov |
| C5  | Identify two more clinical reviewers (one UK, one France)                                           | F     | 30 Nov |
| C6  | Clear the open Clinical items in `LAUNCH-READINESS.md` (FAQ, library, field guide, urgent help box) | C     | 15 Dec |
| C7  | Discuss an ongoing contributor role, only after C2 and C4 happened                                  | F     | Dec    |

The video is educational content: it goes through the clinician review
rules in `clinician-content-review.md` like any other page, and it is
never placed next to a woman's own data.

## Commercial

| #   | Item                                                                                                 | Owner | Target |
| --- | ---------------------------------------------------------------------------------------------------- | ----- | ------ |
| K1  | Interview guide: what they value most, monthly or annual, would they buy one BRIEF on its own        | F     | 8 Nov  |
| K2  | Ten interviews with women in the target group (UK and France first)                                  | F     | 6 Dec  |
| K3  | Van Westendorp questions (too cheap, cheap, expensive, too expensive) in the interviews, per country | F     | 6 Dec  |
| K4  | Private early access offer to the first cohort, to measure real intent                               | F     | Jan    |

Working hypotheses, never published until tested: Essential 8.99,
Premium 14.99, Clinical 24.99 per month. Export and deletion stay free on
every tier; the BRIEF is the obvious paid feature to test, not access to
her own data.

## Governance

What the repo already shows, so the plan starts from facts:

- Data is hosted in the EU (Railway, Amsterdam); target users are in the
  UK, France and Japan. The frameworks that bite first are **UK GDPR, EU
  GDPR (special category health data) and Japan's APPI**.
- HIPAA applies to US covered entities and their business associates. A
  direct to consumer app outside the US is very likely neither, but that
  is a question for counsel, not for us.
- `BRAND-FOUNDATION.md` already says: no HIPAA claims.
- Implemented safeguards are documented: encryption of personal text
  (`ENCRYPTION.md`), encrypted backups with a restore drill, audit logs,
  IDOR audit, minimal summary counts to the AI, tested deletion and export.

| #   | Item                                                                                    | Owner | Target |
| --- | --------------------------------------------------------------------------------------- | ----- | ------ |
| G1  | Correct the HIPAA answer given in the meeting (in the follow up below)                  | F     | 31 Oct |
| G2  | Send counsel question 14 (added); readiness and gaps in `docs/legal/hipaa-readiness.md` | F     | 8 Nov  |
| G3  | Set `DATA_ENCRYPTION_KEY` in production and run the backfill                            | F, E  | 8 Nov  |
| G4  | Error monitoring (`SENTRY_DSN`), with health data scrubbed                              | E     | 22 Nov |
| G5  | Counsel brief answered; Privacy Policy and Terms approved                               | L     | 15 Dec |
| G6  | Contributor agreement for video and content (permissions, attribution, withdrawal)      | F, L  | 30 Nov |

Until G5 is done, the answer to "are you compliant?" is the list of
safeguards, in those words, and "our counsel is reviewing our obligations
in each market".

## Metrics

Already measured (`METRICS.md`): accounts, onboarding, weekly activity,
week 4 retention, BRIEFs created and downloaded. Add:

| Metric                       | Definition                                                                   | Why                       |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| First check in completed     | Share of new accounts with a check in within 48 hours                        | Activation                |
| Check in completion          | Share of started check ins that are saved                                    | Effort is too high if low |
| **BRIEF for an appointment** | Share of active women who generate a BRIEF and say they will take it to care | The north star            |
| New categories used          | Logs of the four new symptoms in the first 30 days                           | Was Michelle right?       |

The north star needs one optional question after BRIEF generation ("Are
you planning to bring this to an appointment?"), added with P3.

## Launch gates for January 2027

EMBR opens to the first cohort only when every gate holds:

1. **Product**: P1 to P3 shipped; every item in the Product section of
   `LAUNCH-READINESS.md` is Done.
2. **Clinical**: P2 and C6 signed off by a named clinician.
3. **Legal**: G5 done; Privacy Policy and Terms published and versioned in
   code.
4. **Evidence**: ten interviews done, a pricing hypothesis per country,
   and at least one confirmed expert collaboration (C2 or C3).
5. **Security**: G3 and G4 done.

The November milestone from the meeting maps onto this: improved MVP (P1
to P3), first clinical reviewers (P2, C5), initial validation (K2), a
pricing hypothesis (K3) and one expert collaboration (C2).

## Not now

| Idea                                  | Decision                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Community forum                       | After launch; needs moderation and safeguarding                        |
| Wearables                             | After retention is proven                                              |
| AI clinical recommendations           | No; outside the doctrine and close to SaMD                             |
| Employer dashboard expansion          | After the individual product is proven                                 |
| Global South markets                  | Partnerships (for example through Vital Voices), not product expansion |
| Advisory title or equity for Michelle | After concrete contributions (C7)                                      |

## Draft follow up to Michelle

> Subject: Thank you, and what we changed after our conversation
>
> Dear Michelle,
>
> Thank you for your time and for such specific feedback. We have already
> acted on part of it: EMBR now tracks painful sex separately from vaginal
> dryness, and irritability, anger and low mood as their own symptoms
> rather than folding them into anxiety. They are on a branch for clinical
> review now, and I would value your eyes on the wording before they go live.
>
> We are also redesigning the lifestyle questions around what supports
> wellbeing, not only what harms it, as you suggested.
>
> On the video: we would love it. A loose outline, if helpful: who you
> are; what women most often misunderstand about menopause; why symptoms
> like anger and brain fog matter; why preparing for an appointment helps;
> and one practical piece of advice. We will send a short permission note
> covering where it would appear.
>
> I would also like to hear more about the webinar with the UK doctor and
> nurse practitioner, and whether EMBR could support it.
>
> One correction from our conversation: when you asked about HIPAA, I
> answered yes. I should have been more precise. EMBR is built for the UK,
> France and Japan, and our data is hosted in the EU, so the frameworks
> that apply first are GDPR and Japan's privacy law, and our counsel is
> confirming our obligations in each market. What I can say with
> confidence is what we have built: encryption of personal text, encrypted
> backups, full audit logging, data export and deletion on request, and
> only summary counts sent to the AI that writes the BRIEF wording.
>
> With thanks,
> [Founder]
