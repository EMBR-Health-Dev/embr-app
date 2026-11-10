# EMBR: data and methods

_One page for scientists and clinicians. Accurate as of `main` on 10
November 2026._

## What EMBR is

A consent based, longitudinal record of the menopausal transition, kept by
the woman herself, and a structured summary of it (the EMBR BRIEF) for her
own consultations. EMBR describes what she recorded. It does not diagnose,
recommend treatment or claim that anything works.

## What is recorded

Self reported, day level entries: 17 named symptoms plus Other with a three
level severity, daily context (sleep duration band, night sweats recall,
stress, caffeine, alcohol, exercise, impact on work and on family and
social life), bleeding and cycle, treatments with start and end dates and
stop reason, and a self described life stage. A monthly Menopause Rating
Scale is built and awaits licensing. Full list: `data-dictionary.md`.

## How the summary is produced

1. **Deterministic first.** Counts, period over period comparisons, a
   symptom co-occurrence detector (minimum 3 shared days), treatment
   windows (14 days before and after a start date, flagged insufficient
   under 3 days after) and week by week severity are computed by fixed,
   versioned code (`interpretationVersion`). The same record always gives
   the same result.
2. **AI only for wording.** A language model writes a short narrative and
   questions from those computed findings only: never raw entries, notes,
   treatment names or her own priorities. Every pattern it mentions must
   cite a finding the engine produced, unaltered, or the wording is
   discarded. A banned-term check blocks diagnostic and prescriptive
   language. If any check fails, the summary is saved without AI wording
   and says so.
3. **Provenance.** Each summary stores the engine version, prompt version,
   model, the findings cited and the exact evidence (dates) behind each.
   An offline evaluation harness runs 15 fictional records through the
   same checks on every change.

## Treatment windows, without efficacy claims

For a treatment started in a period, EMBR shows how many symptom entries
were recorded in the 14 days before and after. It says what changed in her
record, never that the treatment caused it, and marks short windows as
insufficient.

## Governance already in place

- Separate consent items (Terms, Privacy, health data) with versions,
  recorded per change; health features stop if consent is withdrawn.
- Personal free text encrypted at rest; never sent to the AI.
- Audit log of sign in, data access, exports, sharing and admin views.
- Organisation level analytics only as aggregate counts, suppressed below
  a k-anonymity floor of 5 people; individual records are never visible
  to employers.
- Full data export and immediate deletion for every user.
- Hosted in the EU (Amsterdam).

## Limitations

- **Self selected and self reported.** Users are motivated, digitally
  comfortable and not representative of any population.
- **Not trial grade.** Not validated against standard diaries; no
  standardised severity definitions; no source data verification; not
  built to 21 CFR Part 11 or GCP requirements.
- **Day level.** Vasomotor data are days with symptoms, not episodes per
  day.
- **Missing context.** No age, ethnicity, BMI, medical history or dosing.
- **Engagement bias.** People log more when they feel worse; gaps are not
  absence.
- **Research use not yet possible.** The opt-in research consent and
  de-identified release process are drafted, not built, and need ethics
  review and legal advice for each jurisdiction before any data is shared.

## Where it could help

Following the same women across the transition at day level, including
perimenopause and symptoms beyond hot flushes, in languages beyond
English (English, French and Japanese today), and making that record
usable in the consultation. These are hypotheses for studies to test with
academic partners, not findings.
