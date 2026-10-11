# EMBR Research Data Plan

_Written 11 October 2026. Draft for counsel and an ethics board._
_Live copy: https://claude.ai/code/artifact/6020e7c1-3707-4e24-a56a-e01601900831_

## Summary

This plan lets women who choose to contribute their EMBR records to
menopause research, and rules out everything else. It is a draft for
counsel and an ethics board: nothing in it is built, and no data leaves
EMBR until every gate in the rollout section is passed.

Three commitments hold throughout:

- **Separate and optional.** Research use is its own consent, never bundled
  with sign up, and declining changes nothing about the app.
- **Minimum data, never traceable.** Only coded structured fields leave
  EMBR, never names, emails, free text or exact dates, and only through
  approved studies.
- **Withdrawable.** A person can stop contributing at any time, and her
  data is excluded from every future release.

## Research questions

EMBR's pooled records could help with the empirical gap: too few studies
with day level, real world data on the menopause transition. Each question
below needs only structured fields and counts, never free text; an approved
study protocol would set the exact question.

| Question                                                                                                   | Gap it addresses | Fields it needs                                                              |
| ---------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| How often, and on how many days, are common symptoms logged across the transition?                         | Empirical        | Symptom category, severity, coded day                                        |
| Which symptoms are logged on the same days, and how stable are those pairs over months?                    | Empirical        | Symptom category, coded day                                                  |
| How do recalled night sweats compare with night sweats logged at the time?                                 | Methodological   | Night sweats recall bucket, symptom logs                                     |
| How do logged cycle facts (variation, gaps) line up with STRAW+10 style bleeding criteria in everyday use? | Methodological   | Cycle entries, coded day                                                     |
| How do symptom patterns differ between people who report surgical and natural menopause?                   | Knowledge        | Onboarding answer (only if an optional surgical menopause question is added) |

Out of scope for any release: diagnosis, risk prediction, treatment
effectiveness claims, and any study that would identify or contact an
individual.

## Data shared and not shared

Only coded, structured fields can ever leave EMBR; everything a person
wrote in her own words stays in her record. Each approved study receives
the subset its protocol needs, not this whole list.

| Field                                                                        | Shared?       | How it is transformed                                                                             |
| ---------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| Account id, email, password, sessions, IP address                            | Never         | Replaced by a study specific random code that is different for every study                        |
| Symptom category and severity                                                | Yes           | As logged (fixed list of 14, 3 levels)                                                            |
| Symptom date and time                                                        | Coded         | Converted to a day number relative to the person's first entry; no calendar dates, no time of day |
| Symptom notes (free text)                                                    | Never         | Not exported                                                                                      |
| Cycle flow, period start or end                                              | Yes           | Day numbers as above                                                                              |
| Daily context (sleep bucket, caffeine, alcohol, stress, night sweats recall) | Yes           | Day numbers as above                                                                              |
| Treatments                                                                   | Category only | Name removed; start and end as day numbers                                                        |
| Onboarding answers                                                           | Coded         | Fixed answers only                                                                                |
| Notebook (Notes)                                                             | Never         | Not exported                                                                                      |
| BRIEF text and AI wording                                                    | Never         | Not exported                                                                                      |
| Age                                                                          | Banded        | Five year band, only if collected with consent; EMBR does not collect it today                    |
| Country                                                                      | Banded        | Region level only (for example Japan, EU), only if a protocol needs it                            |

Any new field needs a protocol change, ethics approval and an updated
consent wording first.

## Consent

Research use is a separate, unticked choice in Settings, never part of sign
up, and saying no changes nothing about the app. It reuses the append only
consent records EMBR already keeps, as a new versioned item.

**What the person sees** (draft wording for counsel, EN and JA to carry the
same meaning)

> Help menopause research. If you agree, a coded copy of your structured
> entries (symptoms, severity, cycle, daily context) can be used in approved
> research studies. Your name, email, notes and notebook are never shared,
> and calendar dates are removed. You can stop at any time in Settings.
> Saying no does not change how EMBR works for you.

With a link to a plain page listing each approved study, its purpose and
who runs it.

**Rules**

- Consent is opt in, recorded with version, language and time, and can be
  withdrawn in one tap.
- Withdrawal excludes the person from every future release. Data already
  released inside an approved study cannot always be recalled; the consent
  page says so plainly, and counsel decides the exact wording.
- A change to what is shared or who receives it raises the consent version,
  and the person is asked again.
- A person who deletes her account is excluded from every future release
  the same day.

## De-identification and release rules

Removing names is not enough on its own, so every release is checked
against small group rules before it leaves EMBR. EMBR already enforces one
such rule: employer statistics are hidden below 5 people
(`ORG_TRENDS_MIN_COHORT_SIZE`, `cohort-suppression.ts`); research releases
would use a stricter version of the same mechanism.

| Rule                                      | Proposed setting                                                                     | Why                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Minimum group size for any released count | 10 people (the ethics board sets the final number)                                   | Stops a rare combination from pointing to one person       |
| Study codes                               | New random code per person per study                                                 | Two studies cannot be joined to rebuild a person           |
| Dates                                     | Day numbers from first entry, no calendar dates                                      | A known date (an appointment, a holiday) cannot be matched |
| Rare categories                           | Merged or withheld below the minimum group size                                      | Same as above                                              |
| Free text                                 | Never exported, no exceptions                                                        | Free text is the hardest thing to make untraceable         |
| Release format                            | Row level only to approved researchers under contract; public outputs as counts only | Matches the risk to who sees it                            |
| Re-identification                         | Forbidden in every data use agreement, with audit rights                             | Contractual backstop                                       |

Each release is generated by a script, logged in the audit trail, and
checked against these rules automatically before anyone can download it.

## Governance

No study receives data without three approvals: an ethics review of its
protocol, EMBR's data access committee, and a signed data use agreement.

- **Ethics review.** Each study needs approval from a recognised research
  ethics committee, in Japan under the national ethical guidelines for
  medical and health research involving human subjects, and the equivalent
  where the researchers are based. Counsel confirms which committee applies.
- **Data access committee.** At least three people: an EMBR lead, an
  independent clinician and an independent privacy or ethics member. It
  checks that each request matches an approved protocol and needs only the
  fields asked for, and it can refuse.
- **Data use agreement.** Names the researchers, the purpose, the fields,
  where the data is kept, how long it is kept and when it is destroyed.
  Forbids re-identification, linking with other data and sharing onward,
  and gives EMBR audit rights.
- **Academic partner.** The first study should be led by a university or
  hospital research group, not by EMBR alone.
- **Public register.** A page lists every approved study, its purpose, the
  institution and the result once published.
- **No sale of data.** Research access is never sold or used for
  advertising; any cost recovery is set out in the agreement.

## Questions for counsel and the ethics board

Eight decisions sit with them, not with engineering; the plan above is
built to change with their answers.

1. What is the legal basis for research use of health data for users in the
   EU and UK, and is explicit consent the right one?
2. Under Japan's privacy law, do the coded extracts count as pseudonymised
   or anonymised information, and what does that require of EMBR and the
   researchers?
3. Can data from users in Japan, held in the EU, go to a researcher in a
   third country, and under what safeguards?
4. What must the consent page say about data already released when someone
   withdraws?
5. Which ethics committee reviews an EMBR study, and does each study need
   its own review?
6. Is the proposed minimum group size of 10 enough, given the fields
   released?
7. How long may released extracts be kept, and how is destruction
   confirmed?
8. Does research use change EMBR's position on whether it is a medical
   device, or its privacy policy, and what must the policy say?

## Rollout

Seven gates, in order; each must be passed before the next starts, and no
data leaves EMBR before gate 6.

1. **Counsel answers** the eight questions above and approves the consent
   wording in English and Japanese.
2. **Academic partner and first protocol** agreed: one research question,
   the fields it needs, the ethics committee.
3. **Ethics approval** for that protocol.
4. **Build the opt in** in Settings and the public study register; no
   export code yet. Ship it, and let people opt in ahead of any study.
5. **Build the export pipeline**: study codes, day numbers, small group
   checks, audit entry, automatic rule check. Test it on synthetic data
   only.
6. **Data access committee** approves the first request, and the data use
   agreement is signed. Then, and only then, the first coded extract is
   released.
7. **Report back**: the study and its result go on the public register, and
   participants see a plain summary in the app.

Until gate 6, the honest public statement is: "EMBR plans to let people
contribute their records to approved menopause research, by choice and with
names and notes never shared."
