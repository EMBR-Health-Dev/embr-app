# Release QA: the five journeys

Run this by hand before inviting testers back and before any release that
touches sign in, email, sessions or the BRIEF. Automated tests do not cover
real phones, real inboxes or real email apps; this does.

Production web: `https://app.embrhealthcare.com`. Every emailed link
(verification, reset, sign in link, organisation invite) is built from the
API's `APP_URL`, so check that a link in a real email starts with that
address before anything else.

## Before you start

- Use two fresh test addresses you can read on the phone (for example
  `you+qa1@…` and `you+qa2@…`), plus your normal account.
- Devices: one desktop browser (Chrome or Safari) and one iPhone. Add an
  Android phone if you have one.
- On the iPhone, test each emailed link twice: once from **Apple Mail**
  (opens in Safari) and once from the **Gmail app** (opens in Gmail's own
  browser, which keeps its own cookies; see "Known behaviour" below).
- Note the start time; you will match it against the logs at the end.

## What to record for each run

| Journey | Device | Browser / email app | Pass? | Error shown (exact words) | Time taken | Notes |
| ------- | ------ | ------------------- | ----- | ------------------------- | ---------- | ----- |

## Journey 1: invitation to new account

1. From an organisation admin account, invite `qa1`.
2. On the phone, open the invite email and tap the link.
3. The accept page asks you to sign in or create an account. Choose create.
4. Register, tick the required boxes, submit. You should see "check your email".
5. Open the verification email and tap the link.
6. Sign in, then go back to the invite email and tap the link again.

**Pass:** you end up a member of the organisation, without a dead end or an
error page. Write down whether step 6 was needed: the verification email
does not carry you back to the invite on its own, and if testers stumble
here it is the first thing to fix.

## Journey 2: sign in from an emailed link on an iPhone

1. Signed out, on the phone, open `/login` and choose "Email me a sign in link".
2. Open the email and tap the link. The page asks you to tap once more to
   sign in (this stops email scanners from using the link up).
3. You land in the app.
4. Close the browser completely (swipe it away), wait a minute, reopen it
   and go to `https://app.embrhealthcare.com`.
5. Tap the same emailed link again.

**Pass:** steps 3 and 4 show you signed in with no login page in between.
Step 5 says "This link has expired or has already been used" and offers
a new one; it must not sign you out or loop.

## Journey 3: password reset

1. Signed out, open `/forgot-password`, enter the address, submit.
2. Open the email, tap the link, set a new password.
3. Sign in with the new password.
4. Try the old password once.

**Pass:** the new password works, the old one is refused with a clear
message, and the reset link cannot be used a second time.

## Journey 4: coming back after the session has ended

Sessions last 30 days on a device; the short access token renews itself
every 15 minutes while the app is in use.

1. Sign in on the desktop. In the browser's developer tools, delete the
   `embr_at` and `embr_rt` cookies for `app.embrhealthcare.com` (this is
   what an expired session looks like).
2. Reload the dashboard.
3. Now, still signed out this way, open a sign in link or reset link from
   an email.

**Pass:** step 2 sends you to the login page with a short "your session
ended" note, once, with no loop. Step 3 shows the link's own page and works;
it must not bounce you to the login page.

## Journey 5: the core record

1. Signed in, record today's symptoms, with one note and one trigger. Save.
2. Reload the page and check the entry is still there, note included.
3. In Settings, set (or check) the last period date.
4. Generate a Clinical BRIEF, open it, and download the PDF.

**Pass:** the entry survives the reload, the BRIEF shows the logged
symptoms and the last recorded period, and the PDF opens with every
section readable (no garbled text).

## Check the logs

In Railway, open the `@embr/web` service, **HTTP logs**, for the time you
tested. Look at paths starting with `/api/auth/`.

- Expected and harmless: a `401` on `/api/auth/me` and `/api/auth/refresh`
  when you load a page signed out.
- Worth a look: any `5xx`; a `401` on `/api/auth/refresh` while you were
  signed in; `/api/auth/login-link/consume` or `/api/auth/reset-password`
  returning `401` the first time you used a fresh link; the same page
  requested over and over in a few seconds (a redirect loop).

## Known behaviour (not bugs)

- **Gmail and other in app browsers.** A link opened from the Gmail app on
  an iPhone signs you in inside Gmail's browser only. Opening the site in
  Safari afterwards shows you signed out, because the two do not share
  cookies. If a tester says "I signed in but it forgot me", ask which app
  opened the link first. Suggest they long press the link and choose
  "Open in Safari", or add the site to their home screen from Safari.
- **Sign in links** work once and expire after 15 minutes. Requesting a new
  one makes older ones stop working.
- **Each device signs in separately.** Signing in on the phone does not
  sign in the laptop.

## Done when

Every journey passes on desktop and on the iPhone, every failure has its
device, app, exact error and time written down, and anything that failed
is logged as an issue before testers are invited back.
