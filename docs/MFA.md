# Two-step sign in (authenticator app)

Optional for everyone. When it's on, signing in with a password or with an
email sign in link asks for a 6 digit code from an authenticator app
(Google Authenticator, Microsoft Authenticator, 1Password, Authy and others).

## How it works

- **Codes:** TOTP (RFC 6238), SHA-1, 6 digits, 30 second steps, with one
  step either side allowed for clock drift. The code lives in
  `apps/api/src/lib/totp.ts`, has no new dependency, and is tested against
  the RFC 4226 and RFC 6238 test vectors.
- **Setup in two steps:**
  1. `POST /auth/mfa/setup` returns a secret and an `otpauth://` URI for a
     QR code. The secret is held as pending for 15 minutes.
  2. `POST /auth/mfa/confirm` takes a first code from the app. Only then is
     two-step sign in turned on, and 10 recovery codes are returned, once.

  A half-finished setup never changes sign in.

- **Sign in:** with two-step on, a correct password or link returns
  `{ mfaRequired: true, mfaToken }` with no session and no cookies.
  `POST /auth/login/mfa` with that token and a code issues the session. A
  challenge lasts 5 minutes and allows 5 codes.
- **No reuse:** the 30 second step of an accepted code is stored, so the
  same code (or an older one) is refused. The check is one conditional
  update, so two simultaneous requests can't both pass.
- **Recovery codes:** 10 codes such as `ABCDE-FGHJK`, using no
  look-alike characters. Only a hash (salted with the account id) is
  stored, and each code works once; case and dashes are ignored when
  typed. They can be replaced with a current code, which stops the old
  ones working.
- **Turning it off** takes the password and a current code (or a recovery
  code). It deletes the recovery codes and any open challenges.

## Data and privacy

- The secret is encrypted with `DATA_ENCRYPTION_KEY` (`lib/field-crypto.ts`).
  It is never stored in plain text, never logged, and never in the data
  export; the admin list shows only on or off.
- Recovery codes and challenge tokens are stored only as hashes.
- Deleting the account deletes everything above.
- Audit actions: `MFA_ENABLED`, `MFA_DISABLED`, `MFA_CHALLENGE_FAILED`,
  `MFA_RECOVERY_CODE_USED`, `MFA_RECOVERY_CODES_REGENERATED`. The
  failures, disabling and recovery-code use are logged at warning level
  so they can be alerted on.

## Not covered

- **SSO sign in:** the organisation's identity provider is responsible for
  the second factor there.
- **Password reset:** it doesn't turn two-step off. Someone who has lost
  both their phone and their recovery codes needs support to verify them
  and turn it off by hand.

## Rollout order

The API is backward compatible: nothing changes until someone turns two-step
on. Every client that signs in (web, admin, mobile) must handle
`mfaRequired` before the Settings screen that turns it on ships. Otherwise
someone who turns it on on the web can't sign in to an app that can't ask
for the code.

| Part | What                                                                                                                                                           | Status  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1    | API (#322)                                                                                                                                                     | Merged  |
| 2    | Web: the code step on `/login` and `/login-link`, and the Settings section, hidden unless `NEXT_PUBLIC_MFA_SETUP_ENABLED=true` or she already has it on (#324) | Merged  |
| 3    | Mobile (`app/login.tsx`, `components/mfa-code-step.tsx`, `lib/auth-context.tsx`) and admin (`app/login/page.tsx`) login code step                              | This PR |

Once part 3 is merged and deployed, turn setup on:

1. Admin: deployed with the web apps, nothing else to wait for.
2. Mobile: the code step is in the app itself, so it reaches people only with
   a new build. Before turning setup on, make sure the build testers have
   installed includes part 3; an older build shows the API's answer to a
   two-step account as a failed sign in, with no way to enter the code.
3. Then set `NEXT_PUBLIC_MFA_SETUP_ENABLED=true` on the web service (a build
   argument, like `NEXT_PUBLIC_REGISTRATION_OPEN`) and redeploy the web.

### On mobile and admin

- Mobile: `login()` in the auth context returns either the signed in user or
  `{ mfaToken }`. No tokens are written to the phone's secure storage until
  `completeMfa` succeeds. The login screen then shows the same code step as
  the web (EN/FR/JA), with the recovery code switch, and `/auth/login/mfa` is
  in the mobile API client's no-refresh list.
- Admin: the login page asks for the code after the password, and checks the
  ADMIN role only once the code is accepted, logging a non-admin back out as
  before. When the challenge ends it returns to the password step.
- Setup and turning it off stay on the web Settings page; mobile and admin
  only sign in.

### On the web

- Sign in: after a correct password or email link, `/login` and `/login-link`
  show "Enter your code", with a switch to a recovery code. A wrong code
  keeps her on the step; once the challenge ends (5 minutes or 5 codes) she
  is offered to sign in again. `/auth/login/mfa` is in the API client's
  no-refresh list, so that 401 never looks like an expired session.
- Settings: set up shows a QR code (made in the browser, never sent
  anywhere) and the key in groups of four for typing by hand, then asks for
  a first code. Recovery codes are shown once, with copy and download.
  Replacing them needs a current code; turning it off needs her password
  and a code.
