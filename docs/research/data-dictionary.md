# EMBR data dictionary and endpoint mapping

_Generated from `apps/api/prisma/schema.prisma` on `main`, 10 November 2026.
For research partners. It describes what EMBR records today and how each
field relates to the measurement domains menopause studies commonly use.
It does not claim equivalence with any trial instrument; that judgement
belongs to the study's investigators._

## How to read this

- **Self reported.** Every field is entered by the woman herself in the app
  (web or mobile). Nothing is measured by a device or a clinician.
- **Day level.** Most daily fields allow one value per person per day, so
  EMBR measures _on how many days_ something happened and how severe it
  was that day, not how many times it happened within a day.
- **Optional.** Every daily field can be left blank. "Not answered" is
  stored as empty and is never counted as "none".
- **Research use is not yet enabled.** No data leaves EMBR for research.
  The opt-in research consent and de-identified release process are
  drafted in `docs/planning/research-data-plan.md` and not built.

## Fields

### Symptoms (`symptom_logs`)

| Field                    | Values                                                                                                                                                                                                                                                                                       | Notes                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `category`               | 17 named symptoms plus `OTHER`: `HOT_FLASH`, `NIGHT_SWEATS`, `MOOD_CHANGE`, `SLEEP_DISTURBANCE`, `BRAIN_FOG`, `JOINT_PAIN`, `FATIGUE`, `ANXIETY`, `IRREGULAR_HEARTBEAT`, `VAGINAL_DRYNESS`, `LIBIDO_CHANGE`, `WEIGHT_CHANGE`, `HEADACHE`, `ANGER`, `IRRITABILITY`, `LOW_MOOD`, `PAINFUL_SEX` | Taxonomy pending clinical sign off                                                  |
| `severity`               | `MILD`, `MODERATE`, `SEVERE`                                                                                                                                                                                                                                                                 | Her own rating; no anchoring definitions shown yet                                  |
| `checkInDate`            | calendar date                                                                                                                                                                                                                                                                                | At most one entry per symptom per day (`@@unique([userId, category, checkInDate])`) |
| `occurredAt`             | timestamp                                                                                                                                                                                                                                                                                    | When she says it happened (may be back-filled)                                      |
| `createdAt`, `updatedAt` | timestamps                                                                                                                                                                                                                                                                                   | When she actually entered or changed it                                             |
| `notes`                  | free text                                                                                                                                                                                                                                                                                    | Encrypted at rest. **Never** for research or the AI                                 |

### Daily context (`context_logs`, one row per day)

| Field                          | Values                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `sleepDuration`                | `UNDER_6H`, `SIX_TO_SEVEN_H`, `SEVEN_PLUS_H`                             |
| `nightSweats`                  | Morning recall of last night: `NONE`, `ONE`, `TWO_TO_THREE`, `FOUR_PLUS` |
| `stressLevel`                  | `LOW`, `MODERATE`, `HIGH`                                                |
| `caffeineAfternoon`, `alcohol` | yes / no                                                                 |
| `exercise`                     | `NONE`, `LIGHT`, `MODERATE`, `VIGOROUS`                                  |
| `workImpact`                   | Did symptoms affect work today: `NONE`, `DID_LESS`, `MISSED_TIME`        |
| `socialImpact`                 | Time with family or friends: `NONE`, `DID_LESS`, `MISSED_PLANS`          |

### Cycle (`cycle_entries`)

`date`, `flow` (`SPOTTING`, `LIGHT`, `MEDIUM`, `HEAVY`), `isPeriodStart`,
`isPeriodEnd`. Derived: cycle lengths and last recorded period.

### Treatments (`treatments`)

`category` (`HRT`, `SUPPLEMENT`, `MEDICATION`, `LIFESTYLE`, `OTHER`),
`startDate`, `endDate`, `stopReason` (`SIDE_EFFECTS`, `LONG_TERM_CONCERN`,
`NO_LONGER_NEEDED`, `COST`, `OTHER`, `PREFER_NOT_TO_SAY`). `name` and
`notes` are free text, encrypted, never for research. No dose, route or
adherence is recorded.

### Life stage and baseline

- `onboarding_profiles.lifeStage`: `PERIMENOPAUSE`, `POSTMENOPAUSE`,
  `NOT_SURE` (self described, not clinically staged), plus
  `lastPeriodDate`.
- `baseline_check_ins`: a one time 14 day recall at the start: per symptom
  severity and frequency (`FEW_DAYS`, `HALF_THE_DAYS`, `MOST_DAYS`), sleep
  duration, work impact.

### Menopause Rating Scale (`mrs_check_ins`)

The 11 item MRS (Heinemann et al.), each item 0 to 4, monthly, with the
published somatic, psychological and urogenital subscales computed (never
stored) and `instrumentVersion` recorded. **Built but switched off**
(`MRS_CHECK_IN_ENABLED=false`) until commercial licensing is confirmed;
English only until the validated Japanese wording is licensed. See
`docs/MRS-CHECK-IN.md`.

### Appointment outcome (`brief_feedback`)

Per BRIEF: "Did your EMBR BRIEF help you communicate your symptoms or
concerns during your appointment?" (`YES_SIGNIFICANTLY`, `YES_SOMEWHAT`,
`NOT_REALLY`, `NO`, `NO_APPOINTMENT_YET`). Optional comment is encrypted
and never for research.

### Not collected

Age or date of birth, ethnicity, country of residence (only the interface
language), BMI, medical history, diagnoses, lab values, medication doses.
These matter for most research questions and would need a separate,
consented module.

## Mapping to common study domains

"Domain" means what a study measures, not a specific instrument. A
partner's protocol decides whether an EMBR field is usable, and how.

| Domain                             | Typical in studies                                                          | Closest EMBR field                                                               | Fit and gaps                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Vasomotor frequency                | Hot flush **count per day** in a daily diary, often only moderate to severe | `HOT_FLASH` days per period                                                      | **Partial.** EMBR counts days with hot flushes, not episodes per day                                     |
| Vasomotor severity                 | Mild / moderate / severe per episode, with set definitions                  | Daily `severity` of `HOT_FLASH`                                                  | **Partial.** Same three levels, but no standard definitions shown, one rating per day                    |
| Night sweats                       | Count or severity                                                           | `nightSweats` morning recall (0, 1, 2 to 3, 4+) and `NIGHT_SWEATS` entries       | **Partial.** Banded count                                                                                |
| Sleep                              | Validated sleep questionnaires                                              | `sleepDuration` buckets, `SLEEP_DISTURBANCE`                                     | **Weak.** Duration band only, no validated sleep scale                                                   |
| Menopause specific quality of life | Validated QoL questionnaires (for example MENQOL, MRS)                      | MRS check-in (when licensed)                                                     | **Good once licensed.** MRS is a validated instrument; which instruments to add is for academic advisors |
| Mood                               | Validated mood scales                                                       | `LOW_MOOD`, `ANXIETY`, `IRRITABILITY`, `MOOD_CHANGE`, MRS psychological subscale | **Partial.** Not a validated mood scale                                                                  |
| Genitourinary                      | Validated scales                                                            | `VAGINAL_DRYNESS`, `PAINFUL_SEX`, MRS urogenital subscale                        | **Partial**                                                                                              |
| Functional impact                  | Work productivity and social function scales                                | `workImpact`, `socialImpact`                                                     | **Partial.** Simple 3 level daily items                                                                  |
| Treatment context                  | Exposure with dates and dose                                                | Treatment category, start, end, stop reason                                      | **Partial.** No dose, route or adherence; EMBR never claims effects                                      |
| Menopausal stage                   | STRAW+10 staging from bleeding patterns                                     | Self described `lifeStage`, cycle entries                                        | **Partial.** Bleeding data could support staging; not done                                               |

## Implications for a validation study

The most useful early study would compare EMBR's day level vasomotor and
sleep fields with a validated diary and questionnaire in the same women
over the same weeks, and test the BRIEF's effect on the consultation
(the appointment outcome question is a starting point, not an endpoint).
