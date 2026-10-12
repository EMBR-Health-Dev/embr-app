# Claims inventory

_Compiled 12 October 2026 from `main` of `embr-app` and `landingpage`._

Every factual, medical or statistical claim EMBR makes in public or in the
product: the website (`index.html`, `maya.html`, `founder.html`), the
Field Guide (`docs/content/field-guide/field-guide.html`, published as
`embr-guide.pdf`), and the web and mobile app copy (`apps/web/messages`,
`apps/mobile/locales`, BRIEF wording in `apps/api/src/modules/briefs`).
Japanese text mirrors the English and is not listed separately; every fix
below applies to both languages.

This is the launch item "Claims inventory completed" in
[`../LAUNCH-READINESS.md`](../LAUNCH-READINESS.md). It is for the
clinician (medical claims) and the founder (statistics, company claims).
Nothing here has been changed on the site or in the app yet.

## How to read the status column

| Status           | Meaning                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Sourced**      | The claim matches the source named, checked on 12 October 2026                                |
| **Code**         | A claim about how EMBR works; checked against the code at the path given                      |
| **Reword**       | Close to a source, but the wording goes further than the source does                          |
| **Needs source** | No source found or named; keep only if one is added, otherwise soften or remove               |
| **Clinician**    | Medical wording that is sourced or standard, but needs the clinician's sign off before launch |
| **Founder**      | A fact about the company or founder; keep evidence on file                                    |

## Actions, most important first

1. **Website, `n=3,845 women` (Evidence and Employers sections).** The 40%
   figure applies to the women in the survey who had experienced
   menopause or perimenopause, not to all 3,845. Suggested source line:
   "Gallup–Pivotal Women's Health Survey, July 2026, 3,845 US women",
   linked to the Gallup article.
2. **Website, £1.5bn appears twice with different wording.** The Evidence
   section says "estimated direct annual economic impact of unemployment
   related to menopause in the UK"; the Employers section drops
   "estimated" and "direct". Use the first wording in both places, and
   name the report: NHS Confederation, Gorham and Langham (2024).
3. **Website symptom library, two phrases with no source.** Weight
   Changes: "even without changes to diet or exercise". Fatigue:
   "Persistent tiredness that is not resolved by rest or sleep" (that
   describes chronic fatigue, not menopause fatigue). Suggested rewrites
   are in the table below.
4. **Website, "Grounded in endocrinology and behavioural science".** A
   claim about EMBR itself that no review supports yet. Until the
   clinician signs off, prefer "Built on established clinical guidance,
   reviewed by [clinician]" or remove the line.
5. **App, "Cycle irregularity is expected during perimenopause".**
   "Expected" is stronger than the sources ("common", "usually");
   change to "common", matching the sentence next to it.
6. **Website and app, "under a minute".** EMBR has never measured how
   long an entry takes. Either measure it in early access or say
   "designed to take under a minute".
7. **Employer promise, "no totals for groups smaller than five".** The
   code enforces it, but the threshold is a setting
   (`ORG_TRENDS_MIN_COHORT_SIZE`, default 5). Confirm production does not
   set it below 5.

## 1. Statistics

| Claim                                                                                                                                 | Where                        | Source                                                                                                                                                             | Status                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 40% of US women who have experienced menopause or perimenopause say it has negatively affected their life or work in at least one way | Website: Evidence            | Gallup–Pivotal Women's Health Survey, conducted 14 to 22 July 2026, 3,845 women and 1,296 men; Gallup, 18 September 2026 ("in one or more of nine different ways") | **Reword** the sample line (action 1)            |
| £1.5bn estimated direct annual economic impact of unemployment related to menopause in the UK                                         | Website: Evidence; Employers | NHS Confederation (Gorham and Langham, 2024); cited by the UK government's Menopause in the Workplace literature review (2025) and RAND (2025)                     | **Sourced**; make both mentions match (action 2) |

## 2. Medical statements

### Website FAQ and Field Guide

| Claim                                                                                                              | Where                           | Source                                                                                     | Status                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Perimenopause is the stage of the transition before menopause; cycles can become less predictable                  | FAQ; Field Guide 02             | NHS, Menopause and perimenopause symptoms (May 2026)                                       | **Sourced**                                                          |
| Menopause is defined looking back, after 12 consecutive months without a period, with no other obvious cause       | FAQ; Field Guide 02             | NHS (same page); STRAW+10                                                                  | **Sourced**                                                          |
| There is no single timeline; the transition can span several years                                                 | FAQ; Field Guide 02             | NHS: symptoms usually last 7 to 9 years, sometimes longer                                  | **Sourced**                                                          |
| Hormone levels change during this time, often unevenly                                                             | Field Guide 02                  | NHS: periods change "due to lower hormone levels"                                          | **Clinician** ("often unevenly" is standard but not in the NHS page) |
| Symptoms listed: cycle changes, hot flashes, night sweats, sleep, mood, anxiety, fatigue, cognition, joint pain    | FAQ; Field Guide 03             | NHS symptoms page                                                                          | **Sourced**                                                          |
| "Brain fog" is a commonly used term, not a formal diagnosis                                                        | Website library; Field Guide 03 | NHS uses "brain fog" descriptively                                                         | **Clinician**                                                        |
| Sleep problems, stress, thyroid conditions, anaemia, depression and medications can cause similar symptoms         | Field Guide 03                  | NICE NG23 (differential diagnosis)                                                         | **Clinician**; confirm the list                                      |
| Two symptoms on the same days does not show cause; a change after a treatment is not proof the treatment caused it | Field Guide 05; app; BRIEF      | Statement of method, not a medical claim                                                   | **Code**                                                             |
| Perimenopause often coincides with peak career responsibility; it often begins in a woman's 40s                    | Website: Employers              | NHS: usually between 45 and 55, can be earlier; Gallup: typically begins in the 40s or 50s | **Reword** to "usually begins in the mid 40s"                        |

### Website symptom library

| Symptom                          | Claim                                                                                                                               | Source                                                                                           | Status                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Hot Flashes                      | Sudden waves of heat, often with flushing and sweating, typically lasting a few minutes; one of the most widely recognised symptoms | NHS: "last for several minutes"                                                                  | **Sourced**                                                                                                                      |
| Night Sweats                     | Hot flashes that occur during sleep, sometimes needing a change of clothing or bedding                                              | NHS: hot flushes "during the day or night (night sweats)"                                        | **Sourced**                                                                                                                      |
| Irregular Periods                | Often one of the first signs of perimenopause                                                                                       | NHS: "One of the first signs of perimenopause is usually a change to your periods"               | **Sourced**                                                                                                                      |
| Sleep Disruption                 | Night sweats can also interrupt sleep                                                                                               | NHS: "Sleep problems may be worse if you also have night sweats"                                 | **Sourced**                                                                                                                      |
| Brain Fog, Memory, Concentration | Commonly reported during the transition                                                                                             | NHS: "problems with your memory or concentration"                                                | **Sourced**                                                                                                                      |
| Anxiety, Mood Changes            | Commonly reported, even without an obvious trigger                                                                                  | NHS: mood swings, low mood, anxiety                                                              | **Sourced** ("without an obvious trigger" is **Clinician**)                                                                      |
| Joint Pain                       | Commonly reported                                                                                                                   | NHS: "muscle aches and joint pains"                                                              | **Sourced**                                                                                                                      |
| Weight Changes                   | Often around the midsection, **even without changes to diet or exercise**                                                           | NHS: weight gain is common, often around the stomach and upper body; nothing on diet or exercise | **Reword**: "Weight gain is common during the transition, often around the stomach and upper body."                              |
| Fatigue                          | **Persistent tiredness that is not resolved by rest or sleep**; often alongside disrupted sleep                                     | NHS links tiredness to sleep problems; "not resolved by rest" is not in it                       | **Reword**: "Feeling more tired than usual, often alongside disrupted sleep. Commonly reported during the menopause transition." |

### In the app

| Claim                                                                                                                                                                                 | Where                                                             | Source                                                                                                                                                                                                                                     | Status                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Irregular or absent cycles are common in perimenopause                                                                                                                                | Trends (web and mobile)                                           | NHS symptoms page                                                                                                                                                                                                                          | **Sourced**                                                                       |
| Cycle irregularity is **expected** during perimenopause                                                                                                                               | Trends (web and mobile)                                           | Sources say common or usual                                                                                                                                                                                                                | **Reword** to "common" (action 5)                                                 |
| The science behind hot flashes: oestrogen signalling, KNDy neurons and NK3, neurotransmitters, behavioural approaches, triggers, treatment categories, the fezolinetant liver warning | Web Trends, `apps/web/src/content/hot-flash-reference-library.ts` | Each section cites its own sources: The Menopause Society (hot flashes, hormone therapy, 2023 nonhormone position statement, 2024 hypnosis and CBT review), NICE NG23, FDA (Veozah approval and liver safety communication), PubMed review | **Clinician**: sourced in code; the wording and the sources' currency need review |
| BRIEF caveats: frequency is self reported logging only; co-occurrence is a temporal association, not cause; a treatment window is not evidence the treatment caused a change          | BRIEF, `stage4-interpretation.ts`                                 | Statements of method                                                                                                                                                                                                                       | **Code**                                                                          |
| AI written BRIEF text                                                                                                                                                                 | BRIEF                                                             | The AI receives computed counts and patterns only; every cited pattern is validated against those given (`stage4-validation.ts`)                                                                                                           | **Code**; the generated text itself is bounded, not reviewed per brief            |

## 3. Safety and urgent care

| Claim                                                                                                                                                 | Where                             | Source                                                       | Status                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| Seek urgent help for chest pain, trouble breathing, very heavy bleeding or a sudden severe symptom; emergency numbers 112 (EU), 999 (UK), 119 (Japan) | App safety notice; Field Guide 08 | The numbers are the official emergency numbers               | **Clinician** for the symptom list                             |
| If you are thinking about harming yourself, contact emergency services or a crisis line                                                               | App; Field Guide 08               | Standard wording                                             | **Clinician**; named crisis lines per country still to confirm |
| Speak to a clinician soon about bleeding after menopause, between periods or after sex, or new, severe, persistent or rapidly worsening symptoms      | Field Guide 08                    | NHS: postmenopausal bleeding "needs to be checked"; see a GP | **Sourced**                                                    |
| EMBR is not a substitute for medical care and should never delay it                                                                                   | FAQ; Field Guide 08               | Statement of position                                        | **Code** (no feature contradicts it)                           |

## 4. How EMBR works

| Claim                                                                           | Where                   | Checked against                                                                                           | Status                                            |
| ------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 14 symptom categories, 3 severity levels                                        | Website: How it works   | `SymptomCategory` (14 values, including Other) and `SeverityLevel` (3) in `apps/api/prisma/schema.prisma` | **Code**                                          |
| Co-occurrence needs at least 3 shared days                                      | Website                 | `MIN_CO_OCCURRENCE_DAYS = 3`, `apps/api/src/modules/trends/co-occurrence.ts`                              | **Code**                                          |
| The same record always gives the same result; fixed rules, AI only at the end   | Website; FAQ            | Deterministic pattern engine; AI input is `stage4-ai-projection.ts`                                       | **Code**                                          |
| Notes and treatment names are never sent to the AI; no name, email or free text | Website; FAQ; app       | `stage4-ai-projection.ts` strips treatment names; notes are never loaded for the BRIEF                    | **Code**                                          |
| What the AI cites is checked against the patterns it was given                  | Website                 | `stage4-validation.ts`                                                                                    | **Code**                                          |
| Export your data at any time; delete your account at any time                   | Website; app            | Export routes (including the all data file, #233) and `DELETE /auth/me`                                   | **Code**                                          |
| Employers receive aggregated totals only; none for groups smaller than five     | Website; FAQ; app       | `isSuppressedByCohortSize` with `ORG_TRENDS_MIN_COHORT_SIZE` (default 5)                                  | **Code**; confirm the production value (action 7) |
| Most entries take under a minute                                                | Website; app onboarding | Not measured                                                                                              | **Needs source** (action 6)                       |
| Cycle tracking is optional                                                      | FAQ                     | Cycle entries are never required                                                                          | **Code**                                          |
| EMBR is not a medical device                                                    | FAQ                     | Product position, not a legal finding                                                                     | **Founder**; counsel question 8                   |
| Grounded in endocrinology and behavioural science; evidence based               | Website: Evidence       | No review yet                                                                                             | **Needs source** (action 4)                       |

## 5. Privacy and data

| Claim                                                                                                      | Where             | Status                                                               |
| ---------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| EMBR does not sell health data or use it for advertising                                                   | Website; FAQ      | **Founder**: a commitment; must match the Privacy Policy             |
| Your individual health record is never shared with your employer                                           | Website; FAQ; app | **Code** (organisation views are aggregated)                         |
| A full Privacy Policy will be published before EMBR opens to the public                                    | FAQ               | **Founder**; tracked in the Legal section of the launch gate         |
| Deletion removes data from the active service; backups and retention will be set out in the Privacy Policy | FAQ               | **Code** (backups roll off after about 30 days); counsel question 11 |

## 6. Company and founder

| Claim                                                                                                            | Where                    | Status                                            |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| Top 20 finalist, Women@Dior × UNESCO Dream for Change 2026                                                       | Website header and About | **Founder**: keep the confirmation on file        |
| Founder experience at Chanel, Christian Dior Couture, Deloitte and in M&A, across Europe, Asia and North America | Founder page             | **Founder**                                       |
| Being developed with advisors and collaborators across technology, healthcare and women's health                 | Founder page             | **Founder**: true only while named advisors exist |
| We aim to respond within two business days                                                                       | Website contact          | **Founder**: an operating promise                 |
| Maya is fictional; every figure on her page is calculated from a synthetic record                                | Maya page                | **Code** (calculated on the page)                 |

## Not claims

Copy that describes the product without asserting a fact (for example
"EMBR describes. Your clinician interprets.") and illustrative example
figures clearly marked as samples (the BRIEF preview on the home page,
the Maya page) are not listed.
