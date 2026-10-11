# Changelog: October 2026

Everything merged into `main` in October 2026, newest first, with what it
changed for a person using EMBR. Merge dates are UTC. Planning documents
written alongside this work are in [`docs/planning/`](planning/README.md).

## Open

| PR                                                                     | What it does                                                                  | Status                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| [landingpage#7](https://github.com/EMBR-Health-Dev/landingpage/pull/7) | "Under the hood" evidence engine section on the marketing website (EN and JA) | Open, waiting on founder review |
| [embr-app#209](https://github.com/EMBR-Health-Dev/embr-app/pull/209)   | Dependabot update                                                             | Open, untouched                 |

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

## Principles held throughout

- Counts are deterministic. The AI only words results that the pattern
  engine has already computed, and never sees free text notes, notebook
  entries, treatment names or night sweats recall.
- Sign up stays closed (`PUBLIC_REGISTRATION_ENABLED=false`).
- No new medical claims. Copy that needs a clinician is queued in
  [`planning/clinician-content-review.md`](planning/clinician-content-review.md).
