# Menopause and work: what the IZA paper changes for EMBR

_11 October 2026. Draft. The work impact question (section 3) is built in
#225; the copy rules are not yet used anywhere public._

## The source

Abrahamsson S, Barschkett M, Flatø M. _Beyond Hot Flashes: The Career Cost
of Menopause._ IZA Discussion Paper No. 17789, March 2025.
https://www.iza.org/publications/dp/17789

It links Norwegian national registers with the HUNT health survey
(self-reported age at menopause) and compares women before and after
menopause onset with a stacked difference in differences design. Reported
findings:

- Earnings fall and sick leave rises after menopause onset, and diagnoses
  related to menopause increase.
- Women with no symptoms, and women with mild symptoms who seek care, do
  not show earnings losses.
- Seeking care in time and starting treatment can reduce the losses.

**Status: working paper, not peer reviewed.** Under the rule in
[`clinician-content-review.md`](clinician-content-review.md), it cannot be
the source for a claim in the app. It can be cited, named as a working
paper, in employer, investor and research materials.

## Why it matters to EMBR

The paper's strongest finding is about timing: losses appear where care
comes late. EMBR's purpose is to help a woman arrive at an appointment
early, with a clear record. The paper is evidence that the problem EMBR
works on is real and costly. It is **not** evidence that EMBR changes
anyone's earnings, and nothing we publish may say so.

| May say (with the citation)                                                                                                                                                                   | Must not say                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| "A 2025 working paper using Norwegian register data found that earnings fell and sick leave rose after menopause onset, and that women who sought care in time did not show the same losses." | "EMBR protects your career" or "your earnings" |
| "Menopause symptoms have a measurable cost at work. EMBR helps women prepare for the conversation with a healthcare provider."                                                                | "EMBR reduces sick leave"                      |
| "Seeking care in time matters. EMBR turns what you log into a BRIEF to bring to the appointment."                                                                                             | Any figure EMBR has not measured itself        |

## Changes proposed

### 1. Questions sheet: a "Work" group (content, needs clinician sign off)

Added to the draft questions sheet in
[`clinician-content-review.md`](clinician-content-review.md):

- My symptoms are affecting my work. What could help?
- Is there anything you could write down for my workplace, if I choose to
  share it?

They ask; they assert nothing, like the rest of the sheet.

### 2. Employer page and pitch (copy, uses the wording above)

The organisation side of EMBR already shows employers counts only, hidden
below 5 people (`ORG_TRENDS_MIN_COHORT_SIZE`). The paper gives that offer
an evidence based reason. Use only the "may say" wording, with the
citation and "working paper" named.

### 3. "Did symptoms affect work today?" (built in #225)

A daily context question, built the same way as night sweats recall
(#211, #214):

| Part                | Proposal                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Question            | "Did symptoms affect your work today?"                                                                   |
| Answers             | No · Yes, I did less · Yes, I missed time · (blank means not logged, never "no")                         |
| BRIEF               | A separate line: days answered, and the count of each answer; a breakdown only after 7 answered days     |
| AI                  | Never sent to the AI, like night sweats recall                                                           |
| Employer statistics | **Never included**, not even as suppressed counts. An employer must never see anything about work impact |
| Export              | Included in `/export/context-logs.csv`                                                                   |
| Research data plan  | Not shared unless a protocol asks for it and consent wording names it                                    |

Why it helps: it gives the healthcare provider a concrete, deterministic
count ("symptoms affected work on 9 of 30 answered days") instead of a
memory under pressure in a short appointment.

Before building, one question for counsel (to add to the counsel brief as
question 13): **is information about work absence, linked to health,
subject to extra rules in Japan or the EU, given that EMBR also sells to
employers?** The answer may change whether this ships, or only how it is
worded.

## Not taken from the paper

- Any earnings or sick leave figure. They are Norwegian population results
  and would read as a prediction for the person using the app.
- Treatment advice. The paper's treatment finding is for clinicians to
  weigh, not for EMBR to repeat.
