# Monthly Menopause Rating Scale check-in

A once a month questionnaire using the Menopause Rating Scale (MRS):
11 symptoms she rates herself, each 0 (none) to 4 (extremely severe),
"at this time". It gives the record a score clinicians recognise, next
to the daily entries.

## Switched off until licensed

The MRS is copyrighted by Prof. Lothar A. J. Heinemann. The published
permission to use it without formal approval (Heinemann et al., Health
Qual Life Outcomes 2003;1:28) is written for research. Commercial use
in EMBR needs written confirmation first (ePROVIDE/Mapi lists the
instrument's licensing).

| Switch                             | Where                                         | Default |
| ---------------------------------- | --------------------------------------------- | ------- |
| `MRS_CHECK_IN_ENABLED`             | API: `/mrs-check-ins` answers 404 while false | `false` |
| `NEXT_PUBLIC_MRS_CHECK_IN_ENABLED` | Web: page, menu link and dashboard card       | `false` |

Turn both on together, and only once the licence is confirmed.

## Language

English only. A validated Japanese version exists (Journal of Women's
Health, 2026; 1,600 women). EMBR must use that exact wording under
licence, not its own translation, or it is no longer the validated
scale. Until then the API accepts only `locale: "en"` and the web app
hides the check-in in Japanese.

## What is stored and shown

- One row per completed check-in (`mrs_check_ins`), at most one per
  local date, all 11 answers required. A CHECK constraint keeps each
  answer between 0 and 4. `instrumentVersion` records which wording was
  shown.
- Scores are computed from the answers (`apps/api/src/modules/mrs/mrs-scoring.ts`),
  never stored: total 0 to 44, and the published subscales somatic
  (hot flushes, heart, sleep, joints; 0 to 16), psychological (mood,
  irritability, anxiety, exhaustion; 0 to 16) and urogenital (sexual,
  bladder, vaginal dryness; 0 to 12).
- On her own screens EMBR shows the numbers and how they changed,
  never a severity label.
- Included in the all data export (`menopauseRatingScale`), deleted
  with the account, audited by date only.

## Not built yet

- The BRIEF section (first and latest score in the period, with the
  published reference bands for the clinician).
- Mobile.
- The Japanese version (see Language).
