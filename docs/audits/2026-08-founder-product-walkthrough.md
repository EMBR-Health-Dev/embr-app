# EMBR Founder Product Walkthrough — Pre-Beta

**Method note**: I can't launch a simulator/browser to click through this live, so "manually exercise" here means reading every screen's actual rendered copy, every button label, every error message, and every flow branch in the real code — not summarizing from memory or from the earlier infrastructure audit. Where I quote text below, it's copied verbatim from the file. Primary focus is mobile (`apps/mobile`), since that's the more complete, more recently-built surface; web is checked for parity where it matters.

---

## A note on timing

`main` moved twice while I was writing this: once mid-audit (treatment tracking merged), and once again after I'd drafted an initial version of this walkthrough — a full onboarding implementation (5 screens, mobile + web + backend) landed and was merged as its own "Milestone 18." That directly addressed what was going to be this document's headline finding, so I re-verified against the actual current `main` rather than deliver a stale verdict. What follows reflects that re-check, not the first draft.

The onboarding is genuinely good — it explains what EMBR is in plain language on the first real screen ("A place to keep track of what's actually happening to you... helps you turn what you're experiencing into something you can look back on, understand, and eventually bring into a conversation with your doctor. It doesn't diagnose you..."), personalizes based on an upcoming appointment and what the user's noticed, and ends with an explicit "here's how EMBR works" screen walking through Track → Reflect → Prepare with real example output. It's wired into the actual login flow correctly — `login.tsx` checks `user.onboardingCompletedAt` and routes new users there, and both "finish" paths (log a first entry, or skip to dashboard) correctly mark it complete before navigating. This is not vaporware; it works.

One real, narrow gap I did find in the integration: the _other_ redirect path — `app/index.tsx`, which handles an app relaunch with an already-valid stored session, not a fresh login — does **not** check `onboardingCompletedAt` at all, only whether a user exists. A user who closes the app partway through onboarding (before reaching the final "mark complete" screen) and reopens it later would land directly on the tab bar, silently skipping the rest of onboarding rather than resuming or being asked to finish it. Narrow, but real — worth a one-line fix (check the same field in both places).

## Executive verdict

# START BETA, with a short punch list first

Not the verdict I was about to write before the onboarding merge changed the picture. The stranger-test failure that would have justified "do not start" is now substantively resolved. What's left is a small set of real P1s — none of them block a normal user from completing any journey, all of them are copy/UI-scoped fixes on screens that already work mechanically, most estimable in hours not days.

---

## Critical journey table

| Journey                      | Status                                          | Key issue                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. First-time user           | **PASS** (one narrow edge case)                 | Onboarding (merged after my first pass) genuinely explains what EMBR is, personalizes to the user, and walks through the value loop with real examples before the first log. The only integration gap: closing the app mid-onboarding and reopening skips the rest, since the relaunch-redirect path doesn't check completion status the way the login-redirect path does.                          |
| 2. Returning user            | **NEEDS FIX**                                   | No reflection of any kind exists between sessions — the app looks identical on day 1 and day 10. Nothing tells the user why to keep going.                                                                                                                                                                                                                                                          |
| 3. Clinical use case (BRIEF) | **NEEDS FIX**                                   | Genuinely good once you're in it (clear non-diagnostic framing, real PDF, sensible history) — but date entry is a raw `YYYY-MM-DD` text field with no picker, which is real friction on the one flow you most want to feel trustworthy and easy.                                                                                                                                                    |
| 4. Account management        | **NEEDS FIX** (verges on BLOCKED for App Store) | Password change and session management work and are clearly labeled. Account deletion doesn't exist anywhere — not blocked for a small invite-only web/TestFlight-internal beta, but a real gap against your own stated flow, and a hard App Store submission blocker later.                                                                                                                        |
| 5. Error recovery            | **PASS**                                        | This is the strongest journey. Error messages are calm and specific ("Invalid email or password," "Session expired or already used" — never a raw stack trace or technical string). Access-token expiry is handled transparently via silent refresh in the common case. Optimistic UI (e.g. deleting a symptom log) rolls back correctly on failure instead of silently drifting from server state. |

No journey is BLOCKED in the strict sense you defined (a normal user can technically get through all five), and none are NEEDS-FIX-severe-enough-to-block-beta on their own either. Journey 2 (returning user) is the one I'd watch most closely once real users are in — it's where the Reflect gap actually shows up in practice.

---

## P0 issues

**None**, using your definition (can't complete a journey, data loss, security/privacy compromise, unsafe experience). Nothing found in this pass rises to that bar — the infrastructure audit's P0s (migrations, email delivery, cookie security) are environment/deployment issues, not product-experience ones, and you've already scoped those separately.

---

## P1 issues

**1. Onboarding sets an expectation the ongoing product doesn't yet deliver on.**
The loop-explainer screen shows a concrete example of what "Reflect" looks like: _"Your sleep disruption appeared alongside lower energy on 6 days."_ That's a specific, compelling promise. But nothing after onboarding — not the home screen, not anywhere in day-to-day use — actually produces anything like it. The closest real feature is Trends, which requires accumulated data and isn't framed as a "here's what we noticed" moment. A user who read onboarding carefully and then logs for a few days with nothing coming back may feel more let down than a user who was never shown that example at all.
_Damages: trust, specifically the gap between promise and delivery — arguably worse than under-promising._

**1b. Narrow onboarding-resume gap.** Covered above — the app-relaunch redirect doesn't check `onboardingCompletedAt`, only the fresh-login redirect does. One-line fix once someone's looking at it, not urgent enough to block beta on its own.

**2. No feedback after logging a symptom.**
`handleLogSymptom` in the mobile home screen does exactly this on success: clears the form, silently refreshes the list. No confirmation message, no "logged," no visual acknowledgment beyond the entry appearing in a list below the fold. A user has to notice a change in a scrolling list to know their tap worked.
_Damages: activation — the single most important first action in the product gives no signal it succeeded._

**3. Nothing reflects logging back to the user.**
Confirmed directly: there is no dashboard summary, streak, "you've logged 3 times this week," or any synthesized reflection anywhere in the mobile or web app. The home screen is purely a log-entry form plus a raw list. This is also the "home reflection system" flagged as missing in the infrastructure audit — confirmed here from the product-experience side too. The TRACK step works; the REFLECT step genuinely does not exist yet.
_Damages: retention — nothing in the day-to-day experience gives a reason to open the app again beyond habit alone._

**4. BRIEF date entry is a raw text field.**
`fromDate`/`toDate` are plain `TextInput`s requiring exact `YYYY-MM-DD` input, validated client-side with a regex (`isValidDate`). No date picker, no "last 30 days" shortcut, nothing. This is the flow you most want to feel effortless and trustworthy (it's what a user shows their doctor), and it's currently the most manual-entry-heavy screen in the app.
_Damages: clinical-use trust — a fiddly date field undercuts confidence in a feature meant to feel clinically credible._

**5. Destructive actions have no confirmation step.**
"Revoke" (a session) and "Log out everywhere" both execute immediately on tap — no "are you sure?" There's no account deletion to check this against yet, but the pattern is already present for two lower-stakes destructive actions and is worth deciding on before adding a higher-stakes third.
_Damages: trust in a smaller way — not a beta-blocker on its own, worth fixing alongside #4 since it's a small, similar-shaped change._

---

## Value loop diagnosis

**TRACK → REFLECT → UNDERSTAND → PREPARE → ACT**

| Step           | Verdict                          | Evidence                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Track**      | Works well                       | 2 taps (category, severity) + optional notes + submit. Genuinely lightweight, no friction found here.                                                                                                                                                                                                                |
| **Reflect**    | **Missing** (but well-explained) | Onboarding describes this step clearly and sets a real expectation for it (see P1 #1) — but no actual reflection content exists anywhere post-onboarding. This is the loop's actual break point: the product explains this step better than it currently delivers it.                                                |
| **Understand** | Works, but needs volume          | Trends is real (server-computed, not client-side), with good empty-state copy. But with realistic early-beta usage (a handful of logs over a few days), the symptom-frequency bars will look sparse — the mechanism is sound, the "meaningful pattern" moment needs more data than a new user will have in week one. |
| **Prepare**    | Works well                       | BRIEF turns real data into a real narrative + GP questions + PDF. This step is the most complete part of the loop.                                                                                                                                                                                                   |
| **Act**        | Plausible, unverified            | The output is genuinely something you could hand to a doctor — clear non-diagnostic framing, structured questions. Whether it actually changes a real conversation is something only real beta users can tell you; nothing in the code undermines it.                                                                |

**Weakest link: Reflect.** Not Track (that's fine), not Prepare (that's your strongest feature) — the gap is specifically between logging something and getting anything back for it. Right now the loop is TRACK → (nothing) → UNDERSTAND (eventually, with enough data) → PREPARE → ACT. A user has no reason to believe logging matters until they've accumulated enough for Trends or BRIEF to say something back — and nothing in the interim reassures them it's working.

---

## Stranger test

Answering as someone who has genuinely never seen EMBR, based only on what's actually on screen at each step:

**After the first screen ("Welcome back" / "Create your account"):**
_"What is this?"_ — Still genuinely unanswerable from login/register alone; those two screens carry no framing. But this question gets answered a step later than I first assessed, and answered well: the welcome onboarding screen immediately after first login states plainly what EMBR is, isn't, and is for.

**After onboarding:**
_"What am I supposed to do now?"_ — Clearly answered. The final onboarding screen explains the Track/Reflect/Prepare loop with a real example, then offers exactly one obvious next action ("Log your first entry") plus an honest opt-out ("Go to dashboard instead"). This is a well-designed close to the flow.

**After logging:**
_"What did EMBR give me?"_ — Nothing, visibly. The form clears and the entry appears in a list. No acknowledgment, no "thanks," no hint at what happens with this data next.

**After viewing Trends:**
_"Why should I come back?"_ — Weak with little data ("nothing logged in this window yet" is honest but not motivating), stronger once real data exists (real bars, real cycle-length averages) — but nothing bridges those two states. A user checking Trends on day 2 sees mostly emptiness and no explanation that it gets more useful with time.

**After seeing BRIEF:**
_"Why would I use this with my doctor?"_ — This is the one place the product answers its own question clearly. The screen states outright what it is and isn't, generates a real document, and the framing throughout ("Questions to bring to your GP," not assertions) is exactly the kind of thing that would make sense to hand someone in a waiting room.

---

## Founder product questions

**1. What does EMBR currently do better than a generic symptom tracker?**
BRIEF. Structured GP-visit prep with explicit non-diagnostic framing is a real, specific thing a generic tracker doesn't do. Everything before BRIEF (logging, trends) is competent but not differentiated — plenty of trackers do category/severity logging and frequency charts.

**2. What becomes more valuable after 7 days of use?**
Trends, mechanically — more data points make the frequency view and cycle-length calculation genuinely more informative. But nothing in the product _tells_ the user this is happening; the value accrues silently.

**3. What becomes more valuable after 30 days?**
BRIEF, meaningfully — a month of data gives it something substantial to summarize instead of a sparse one. This is arguably the product's real "aha" moment, and it's gated behind a month of unprompted, unrewarded logging with nothing in between to sustain it.

**4. What is the strongest reason to generate a BRIEF?**
Having an upcoming GP appointment and wanting to walk in prepared. The feature is built for exactly that moment and does it well.

**5. What is currently the strongest reason to return to EMBR?**
Honestly: habit alone, or a scheduled appointment prompting a BRIEF. There is no in-product mechanism (reflection, streak, reminder, changed-since-last-time summary) creating a reason to return — that has to come entirely from the user's own memory and motivation right now.

**6. What is currently missing from the product's core value loop?**
Reflect. Repeating this deliberately since it's the same answer from three different angles above (weakest link, stranger test, "why return") — it's not a minor gap, it's the one place the loop actually breaks.

---

## Recommended punch list before beta

None of these are new features — all are copy, framing, or small UI additions to screens that already exist and already work mechanically. None block starting beta on their own; I'd still do them first given how cheap they are relative to what they fix.

1. **Fix the onboarding-resume gap.** Make `app/index.tsx`'s relaunch redirect check `onboardingCompletedAt` the same way `login.tsx` already does. One field, two files.
2. **Confirm a symptom log succeeded.** A toast, a brief inline message, a checkmark — anything that isn't "silently update a list below the fold."
3. **Add the smallest possible ongoing reflection.** Doesn't need to be sophisticated — "You've logged 3 times this week" or "Most common this week: hot flashes" on the home screen would close most of the gap onboarding's own example (P1 #1) sets up. Closest item on this list to being a real feature rather than a copy/UI fix, but still small — a single computed line, likely reusing data Trends already fetches.
4. **Replace the BRIEF date `TextInput`s with a native date picker.** Removes the format-guessing friction on your strongest feature.
5. **Add a confirmation step to session revoke / logout-everywhere.** Small, consistent with whatever pattern you'd want for account deletion later.

None of these require touching Prisma, adding AI, adding notifications, or redesigning anything.

**Estimate**: 1–2 days, all UI/copy work on already-built screens. Well inside a single focused session — could reasonably be done before your first beta user even without delaying the start.

---

## First beta observation plan (once the above is done)

The five things worth watching a real person do, in order of what they'd tell you:

1. **What they say out loud (or type) in the first 60 seconds of onboarding.** Does the welcome/loop copy actually land, or do they still seem unsure what EMBR is for once they reach the dashboard? Tests whether onboarding is doing its job in practice, not just on paper.
2. **Whether they log a second thing without being asked.** The gap between "logged once because you told them to" and "came back and logged again unprompted" is the real signal for whether TRACK→REFLECT is doing its job — and whether punch-list item #3 (ongoing reflection) is worth prioritizing further.
3. **What they expect Trends to show before they open it, versus what's actually there.** Tells you whether the feature matches the mental model onboarding created.
4. **Whether they generate a BRIEF without prompting, or need to be told it exists.** Discoverability check on your strongest feature — if 5 people all need a nudge to find it, that's worth knowing before wider beta.
5. **What they do with the BRIEF output** — do they actually save/share the PDF, or just read it and close the app? This is the closest proxy you have for whether "Act" (the last step of the loop) is real or aspirational.
