# Mobile device QA

The launch item "Mobile QA" in [`LAUNCH-READINESS.md`](LAUNCH-READINESS.md)
needs a pass on real iPhones and Android phones. This page is the script
for that pass and the record of what has been checked so far.

## Pass on 12 October 2026 (no devices)

There were no physical devices, so the app was checked in two ways.

**Builds.** `expo export` for iOS, Android and web. Before this pass,
**every build failed**: Expo Router treats each file under `app/` as a
route, so the three screen test files kept there were bundled into the
app together with vitest (`SyntaxError ... vite/dist/node/module-runner.js:
Invalid call ... import(filepath)`). The first arrived with the private
early access change (`364a56a`), two more in #226 and #227. The tests now
live in `apps/mobile/test/screens`, `test/no-tests-in-app.test.ts` fails
if one is added under `app/` again, and the iOS, Android and web bundles
build.

**Screens.** The web build (React Native Web) at 320, 375, 390 and 412
points wide, English and Japanese, against a local API with six weeks of
sample entries: Symptoms, Cycle, Treatments, Trends, BRIEF, Settings and
Log in, 56 screens in all.

| Check                     | Result                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Horizontal overflow       | None on any screen                                                                                                                                           |
| Page or console errors    | None from the app (the web build only lacks secure storage, which phones have)                                                                               |
| API errors                | None                                                                                                                                                         |
| Screen reader roles       | 37 tappable elements had no role, so VoiceOver and TalkBack would not say they can be tapped. Fixed; `test/pressable-roles.test.ts` keeps every one labelled |
| Tab labels at 320 and 375 | "Symptoms" and "Treatments" were cut short in the web build. Web text rendering differs from iOS and Android, so check this on a device (step 3 below)       |
| Small tap targets         | "Forgot password?" and "Create an account" are text links about 16 points tall; check they are easy to tap on a device                                       |

## Script for real devices

Run on at least one small iPhone (SE, 375 points), one current iPhone and
one mid range Android phone, in English and in Japanese. Use an early
access test account on production, never a real person's account.

1. **Install and open.** Install the EAS preview build. The app opens to
   Log in with no red screen and no warning about the API address.
2. **Sign in and stay signed in.** Log in, close the app fully, open it
   again: still signed in. Log out: back to Log in.
3. **Tab bar.** All six labels readable in full, in both languages, on
   the small iPhone. Note any that are cut short.
4. **Log a symptom.** Pick two symptoms and a severity, save. Both appear
   in the list below with the right time. Delete one.
5. **Cycle, daily context and work.** Save today's cycle entry. Answer
   the night sweats and work questions; change one answer and check the
   other is kept.
6. **Treatments.** Add a treatment with a start date, end it today, give
   a reason for stopping. The date pickers open and close on both
   platforms.
7. **Trends.** The bars and cycle lengths show for the test account.
8. **BRIEF.** Generate a BRIEF for the last 90 days, open it, share the
   PDF to Files (iOS) or Drive (Android), open the PDF.
9. **Settings.** Switch language and back; resend verification if shown;
   change password and log in with the new one.
10. **Screen reader.** With VoiceOver (iOS) and TalkBack (Android) on,
    move through Log in, Symptoms and BRIEF. Every control is read with
    its role ("button", "link", "selected"), and the severity choice is
    understandable without seeing colour.
11. **Text size.** Set the phone's text size to the largest standard
    setting. Nothing overlaps or is cut off on Symptoms, BRIEF and
    Settings.
12. **Offline.** Turn on airplane mode, try to save a symptom: a clear
    error, no crash. Turn it off and save again.

Record each run below: date, device, OS version, language, build, and
any step that failed with a screenshot.

| Date | Device | OS  | Language | Build | Result |
| ---- | ------ | --- | -------- | ----- | ------ |
|      |        |     |          |       |        |
