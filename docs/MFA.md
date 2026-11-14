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
