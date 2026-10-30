# Changelog: October 2026

Everything merged into `main` in October 2026, newest first, with what it
changed for a person using EMBR. Merge dates are UTC. Planning documents
written alongside this work are in [`docs/planning/`](planning/README.md).

## Open

Checked against GitHub on 30 October 2026.

| PR                                                                     | What it does                                                                                                        | Status                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [embr-app#297](https://github.com/EMBR-Health-Dev/embr-app/pull/297)   | Save the first check in as a one time baseline (new tables; plan in `planning/baseline-check-in.md` on that branch) | Open, merge needs explicit approval       |
| [embr-app#299](https://github.com/EMBR-Health-Dev/embr-app/pull/299)   | Clinical Intelligence 2.0: severity week by week in the BRIEF, family and social impact question (two migrations)   | Open                                      |
| [embr-app#300](https://github.com/EMBR-Health-Dev/embr-app/pull/300)   | Raise the `decode-uri-component` override to 0.5.1 so the security scan passes again                                | Open                                      |
| [landingpage#7](https://github.com/EMBR-Health-Dev/landingpage/pull/7) | "Under the hood" evidence engine section on the marketing website (EN and JA)                                       | Last known open; not re-checked on 30 Oct |

[embr-app#209](https://github.com/EMBR-Health-Dev/embr-app/pull/209) (a Dependabot update) was listed here as open; it was closed without merging.

## Merged

### Record and Timeline

| PR                                                           | Merged | Change                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#220](https://github.com/EMBR-Health-Dev/embr-app/pull/220) | 11 Oct | Notebook: private notes with five cover colours (lilac, plum, pearl, ice, rose). Cover can be changed on any existing note. Notes are exportable (`/export/notes.csv`), audited by id only, and never sent to the AI |
| [#216](https://github.com/EMBR-Health-Dev/embr-app/pull/216) | 10 Oct | Month view on Timeline, calendar style, with a mark on each day that has entries                                                                                                                                     |
| [#215](https://github.com/EMBR-Health-Dev/embr-app/pull/215) | 10 Oct | Ranked symptom bars on Timeline: top 5 symptoms by days logged in the chosen range                                                                                                                                   |
| [#214](https://github.com/EMBR-Health-Dev/embr-app/pull/214) | 10 Oct | Recalled night sweats shown on Timeline and in the BRIEF, kept separate from symptom counts; breakdown only after 7 answered mornings                                                                                |
| [#211](https://github.com/EMBR-Health-Dev/embr-app/pull/211) | 10 Oct | Morning question "night sweats last night?" (none, 1, 2 to 3, 4 or more). A blank answer means not logged, never none                                                                                                |

### EMBR BRIEF

| PR                                                           | Merged | Change                                                                                                                                                  |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#218](https://github.com/EMBR-Health-Dev/embr-app/pull/218) | 10 Oct | More colour in the web and PDF BRIEF: plum masthead, lilac headings, severity bars. Static Noto Sans JP weights so Japanese renders at the right weight |
| [#217](https://github.com/EMBR-Health-Dev/embr-app/pull/217) | 10 Oct | "Healthcare provider" instead of "GP" in web, mobile, PDF and the AI wording prompt                                                                     |
| [#213](https://github.com/EMBR-Health-Dev/embr-app/pull/213) | 10 Oct | BRIEF page restyled to read like a printed report                                                                                                       |

### Data rights

| PR                                                           | Merged | Change                                                                                    |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| [#212](https://github.com/EMBR-Health-Dev/embr-app/pull/212) | 10 Oct | Daily context (sleep, caffeine, alcohol, stress, night sweats) added to the export as CSV |

### Display and accessibility

| PR                                                           | Merged | Change                                                                             |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| [#219](https://github.com/EMBR-Health-Dev/embr-app/pull/219) | 11 Oct | Dark mode for the web app (system, light, dark), stored in the `EMBR_THEME` cookie |
| [#210](https://github.com/EMBR-Health-Dev/embr-app/pull/210) | 10 Oct | Text size setting in Settings, stored in the `EMBR_TEXT_SIZE` cookie               |
| [#200](https://github.com/EMBR-Health-Dev/embr-app/pull/200) | 10 Oct | Larger default text in the web app                                                 |
| [#203](https://github.com/EMBR-Health-Dev/embr-app/pull/203) | 10 Oct | Wordmark no longer overlaps the onboarding progress bar                            |

### Landing page

| PR                                                           | Merged | Change                                                                                                                                                  |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#221](https://github.com/EMBR-Health-Dev/embr-app/pull/221) | 11 Oct | "Under the hood" section showing the evidence engine as an animated example run; respects reduced motion. Every figure quoted comes from code constants |

### Security, dependencies and deploys

| PR                                                                                                                           | Merged | Change                                                         |
| ---------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| [#201](https://github.com/EMBR-Health-Dev/embr-app/pull/201)                                                                 | 10 Oct | Patched five newly published advisories                        |
| [#204](https://github.com/EMBR-Health-Dev/embr-app/pull/204)                                                                 | 10 Oct | Dependabot no longer opens major version upgrades              |
| [#205](https://github.com/EMBR-Health-Dev/embr-app/pull/205) to [#208](https://github.com/EMBR-Health-Dev/embr-app/pull/208) | 10 Oct | Node 22.22 to 22.23 base images for admin, api, web and worker |
| [#199](https://github.com/EMBR-Health-Dev/embr-app/pull/199)                                                                 | 3 Oct  | Registration flag passed into the web production build         |

[#202](https://github.com/EMBR-Health-Dev/embr-app/pull/202) was closed without merging.

## Merged since 11 October

Merged after the sections above were written, newest first. Titles are the pull request titles as merged, not rewritten; open the PR for the detail. Dates are UTC.

| PR                                                           | Merged | Title                                                                                       |
| ------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| [#298](https://github.com/EMBR-Health-Dev/embr-app/pull/298) | 30 Oct | Clinician feedback: new symptoms, BRIEF priorities, error report hardening, HIPAA readiness |
| [#295](https://github.com/EMBR-Health-Dev/embr-app/pull/295) | 29 Oct | feat(web): account free first check in, on the device only                                  |
| [#294](https://github.com/EMBR-Health-Dev/embr-app/pull/294) | 29 Oct | Keep the local integrity check as a repeatable script                                       |
| [#293](https://github.com/EMBR-Health-Dev/embr-app/pull/293) | 29 Oct | Fix clinician summary PDF dates: print each entry on her local day                          |
| [#292](https://github.com/EMBR-Health-Dev/embr-app/pull/292) | 29 Oct | Update the weekly email language at sign in                                                 |
| [#291](https://github.com/EMBR-Health-Dev/embr-app/pull/291) | 28 Oct | Send the weekly email in the language she turned it on in                                   |
| [#290](https://github.com/EMBR-Health-Dev/embr-app/pull/290) | 28 Oct | feat(api): Japanese emails                                                                  |
| [#289](https://github.com/EMBR-Health-Dev/embr-app/pull/289) | 28 Oct | feat(api): French emails                                                                    |
| [#287](https://github.com/EMBR-Health-Dev/embr-app/pull/287) | 27 Oct | feat(web, mobile): French translation and language toggle                                   |
| [#286](https://github.com/EMBR-Health-Dev/embr-app/pull/286) | 27 Oct | feat(api): French locale for BRIEF, consent and Accept-Language                             |
| [#285](https://github.com/EMBR-Health-Dev/embr-app/pull/285) | 27 Oct | BRIEF: Menopause Rating Scale section (behind the MRS switch)                               |
| [#284](https://github.com/EMBR-Health-Dev/embr-app/pull/284) | 27 Oct | Hand-checked BRIEF records, and fixes for the previous period and tie order                 |
| [#283](https://github.com/EMBR-Health-Dev/embr-app/pull/283) | 27 Oct | Test that vigorous exercise never changes which pattern wins a tie                          |
| [#282](https://github.com/EMBR-Health-Dev/embr-app/pull/282) | 27 Oct | Stop saving unanswered caffeine and alcohol as "no"                                         |
| [#281](https://github.com/EMBR-Health-Dev/embr-app/pull/281) | 27 Oct | Monthly Menopause Rating Scale check-in (behind a switch)                                   |
| [#280](https://github.com/EMBR-Health-Dev/embr-app/pull/280) | 27 Oct | Count vigorous exercise as a context pattern factor                                         |
| [#279](https://github.com/EMBR-Health-Dev/embr-app/pull/279) | 27 Oct | chore(deps): Bump the minor-and-patch group with 8 updates                                  |
| [#278](https://github.com/EMBR-Health-Dev/embr-app/pull/278) | 26 Oct | BRIEF: an exercise section, counted from the daily answers                                  |
| [#277](https://github.com/EMBR-Health-Dev/embr-app/pull/277) | 26 Oct | Daily context: record how hard she exercised                                                |
| [#276](https://github.com/EMBR-Health-Dev/embr-app/pull/276) | 26 Oct | Keep deleted accounts in week 4 retention, anonymously                                      |
| [#275](https://github.com/EMBR-Health-Dev/embr-app/pull/275) | 26 Oct | Metrics: activity is when entries are made, and only whole weeks in the cohort              |
| [#274](https://github.com/EMBR-Health-Dev/embr-app/pull/274) | 26 Oct | Count symptom entries on her local day, not the UTC day                                     |
| [#273](https://github.com/EMBR-Health-Dev/embr-app/pull/273) | 26 Oct | Date-only columns: filter by the local days picked, not their UTC dates                     |
| [#269](https://github.com/EMBR-Health-Dev/embr-app/pull/269) | 26 Oct | API tests: run integration files one at a time                                              |
| [#265](https://github.com/EMBR-Health-Dev/embr-app/pull/265) | 26 Oct | BRIEF: count date-only records by the calendar days the person picked                       |
| [#264](https://github.com/EMBR-Health-Dev/embr-app/pull/264) | 26 Oct | Seed the demo record's history without loosening the check in date rule                     |
| [#272](https://github.com/EMBR-Health-Dev/embr-app/pull/272) | 26 Oct | Notes: newest first by month, with previews, search and no lost text                        |
| [#271](https://github.com/EMBR-Health-Dev/embr-app/pull/271) | 26 Oct | Treatments: a timeline, current and past, and the real stop date                            |
| [#270](https://github.com/EMBR-Health-Dev/embr-app/pull/270) | 26 Oct | Signals: every symptom on one shared timeline, counted in days                              |
| [#268](https://github.com/EMBR-Health-Dev/embr-app/pull/268) | 26 Oct | BRIEF: show the period day by day, on the web and in the PDF                                |
| [#267](https://github.com/EMBR-Health-Dev/embr-app/pull/267) | 26 Oct | Dashboard: a week of better and harder days, and recent entries by day                      |
| [#266](https://github.com/EMBR-Health-Dev/embr-app/pull/266) | 26 Oct | Timeline and symptom calendar: chronology first, severity by shape                          |
| [#262](https://github.com/EMBR-Health-Dev/embr-app/pull/262) | 26 Oct | Record yesterday's context, with the target date spelled out                                |
| [#261](https://github.com/EMBR-Health-Dev/embr-app/pull/261) | 26 Oct | Check in reliability: fill in yesterday, and stop a second save erasing today's context     |
| [#263](https://github.com/EMBR-Health-Dev/embr-app/pull/263) | 25 Oct | Security: reject oversized request arrays before parsing, and patch body-parser             |
| [#260](https://github.com/EMBR-Health-Dev/embr-app/pull/260) | 25 Oct | Claude/embr repo reconnaissance cr1lyt                                                      |
| [#259](https://github.com/EMBR-Health-Dev/embr-app/pull/259) | 23 Oct | chore(deps): Bump the minor-and-patch group with 13 updates                                 |
| [#258](https://github.com/EMBR-Health-Dev/embr-app/pull/258) | 17 Oct | Release QA checklist, and stop a used sign in link spending the sessi…                      |
| [#257](https://github.com/EMBR-Health-Dev/embr-app/pull/257) | 17 Oct | Keep emailed links working when an old session has expired                                  |
| [#256](https://github.com/EMBR-Health-Dev/embr-app/pull/256) | 17 Oct | Weekly email reminder for testers, opt in from Settings                                     |
| [#255](https://github.com/EMBR-Health-Dev/embr-app/pull/255) | 16 Oct | Public beta guide page at /beta                                                             |
| [#254](https://github.com/EMBR-Health-Dev/embr-app/pull/254) | 16 Oct | Ask for the date of her last period in Settings                                             |
| [#229](https://github.com/EMBR-Health-Dev/embr-app/pull/229) | 16 Oct | feat(scripts): add synthetic demo seed ("Maya") that drives the real API                    |
| [#253](https://github.com/EMBR-Health-Dev/embr-app/pull/253) | 16 Oct | Show the last period day logged in the BRIEF                                                |
| [#251](https://github.com/EMBR-Health-Dev/embr-app/pull/251) | 16 Oct | Sign in with an email link                                                                  |
| [#252](https://github.com/EMBR-Health-Dev/embr-app/pull/252) | 16 Oct | Mobile beta builds for TestFlight and Play internal testing                                 |
| [#250](https://github.com/EMBR-Health-Dev/embr-app/pull/250) | 16 Oct | Make the first days easier for beta testers                                                 |
| [#249](https://github.com/EMBR-Health-Dev/embr-app/pull/249) | 15 Oct | chore(deps): Bump the minor-and-patch group with 3 updates                                  |
| [#243](https://github.com/EMBR-Health-Dev/embr-app/pull/243) | 14 Oct | Add an optional daily check in reminder to the mobile app                                   |
| [#248](https://github.com/EMBR-Health-Dev/embr-app/pull/248) | 14 Oct | Lead the landing page with one outcome and three steps                                      |
| [#247](https://github.com/EMBR-Health-Dev/embr-app/pull/247) | 14 Oct | Make the encryption backfill safe to run on production                                      |
| [#246](https://github.com/EMBR-Health-Dev/embr-app/pull/246) | 13 Oct | Remove the note promising the legal documents before sign up opens                          |
| [#245](https://github.com/EMBR-Health-Dev/embr-app/pull/245) | 13 Oct | Landing: jump to section row on mobile                                                      |
| [#244](https://github.com/EMBR-Health-Dev/embr-app/pull/244) | 12 Oct | Add an admin metrics page: product health as plain counts                                   |
| [#242](https://github.com/EMBR-Health-Dev/embr-app/pull/242) | 12 Oct | Make the dashboard shorter: fold the optional daily forms                                   |
| [#241](https://github.com/EMBR-Health-Dev/embr-app/pull/241) | 12 Oct | Add soft icons and an illustrated week card to the homepage                                 |
| [#240](https://github.com/EMBR-Health-Dev/embr-app/pull/240) | 12 Oct | Add "Your week" to the dashboard: seven days at a glance and today's list                   |
| [#239](https://github.com/EMBR-Health-Dev/embr-app/pull/239) | 12 Oct | Show a bleeding log instead of cycle tracking after menopause                               |
| [#238](https://github.com/EMBR-Health-Dev/embr-app/pull/238) | 12 Oct | Add a self reported life stage to onboarding and Settings                                   |
| [#228](https://github.com/EMBR-Health-Dev/embr-app/pull/228) | 12 Oct | chore(deps): override qs, decode-uri-component and vitest to patched …                      |
| [#237](https://github.com/EMBR-Health-Dev/embr-app/pull/237) | 12 Oct | feat(api): encrypt personal text in the database                                            |
| [#232](https://github.com/EMBR-Health-Dev/embr-app/pull/232) | 12 Oct | chore(deps): Bump the minor-and-patch group across 1 directory with 35 updates              |
| [#235](https://github.com/EMBR-Health-Dev/embr-app/pull/235) | 12 Oct | fix(mobile): every build failed; add screen reader roles                                    |
| [#236](https://github.com/EMBR-Health-Dev/embr-app/pull/236) | 12 Oct | docs: record the first backup restore drill (passed)                                        |
| [#234](https://github.com/EMBR-Health-Dev/embr-app/pull/234) | 12 Oct | docs: inventory every claim EMBR makes, with its source or a fix                            |
| [#233](https://github.com/EMBR-Health-Dev/embr-app/pull/233) | 12 Oct | feat(export): download the whole record as one file                                         |
| [#231](https://github.com/EMBR-Health-Dev/embr-app/pull/231) | 12 Oct | docs: record the real production setup, with the admin app on Railway                       |

## Principles held throughout

- Counts are deterministic. The AI only words results that the pattern
  engine has already computed, and never sees free text notes, notebook
  entries, treatment names or night sweats recall.
- Sign up stays closed (`PUBLIC_REGISTRATION_ENABLED=false`).
- No new medical claims. Copy that needs a clinician is queued in
  [`planning/clinician-content-review.md`](planning/clinician-content-review.md).
