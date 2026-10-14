# Encryption of personal data

## What is encrypted, and where

| Layer                         | What                                                                                                                                                     | How                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| In transit                    | Every request between apps and the API, and the API to Anthropic                                                                                         | HTTPS (TLS)                                                                            |
| Passwords                     | Account passwords                                                                                                                                        | Argon2id hash, never reversible (`apps/api/src/modules/auth/password.ts`)              |
| Personal text in the database | Symptom, cycle and treatment notes; treatment names; notebook titles and pages; each stored BRIEF's AI wording, discussion points and treatment snapshot | AES-256-GCM in the API before it reaches Postgres (`apps/api/src/lib/field-crypto.ts`) |
| SSO secrets                   | Organisations' OIDC client secrets                                                                                                                       | AES-256-GCM with `SSO_ENCRYPTION_KEY`                                                  |
| Backups                       | The whole database dump                                                                                                                                  | GPG AES-256 with `BACKUP_ENCRYPTION_KEY` (`docs/BACKUPS.md`)                           |
| Mobile tokens                 | Login tokens on the phone                                                                                                                                | iOS Keychain and Android Keystore via expo-secure-store                                |

**Not encrypted at field level, by design:** symptom categories, severities,
dates and other structured values that the app counts, compares and
filters in SQL; email addresses, which are used to sign in. These are still
protected by access controls and, in backups, by backup encryption.

**The AI never receives any of the encrypted text.** BRIEF wording is
generated from computed counts and patterns only
(`apps/api/src/modules/briefs/stage4-ai-projection.ts`); notes, notebook
pages and treatment names are never sent.

## How the field encryption works

- One layer in the database client (`apps/api/src/lib/prisma.ts`) encrypts
  the listed fields on every write and decrypts them on every read, inside
  transactions too. No repository handles ciphertext, and none can forget
  to encrypt.
- Each value gets a fresh random nonce and is bound to its table and
  column, so a value copied into another column will not decrypt.
- Stored as `enc:v1:<iv>.<tag>.<ciphertext>`. Values without the prefix
  were written before encryption and are read as they are.
- Encrypted fields cannot be searched, filtered or sorted in SQL. Do not
  add a query that does.

## The key: `DATA_ENCRYPTION_KEY`

- A base64 32-byte key, required: the API will not start without it and
  never stores this text unencrypted.
- Generate it once with `openssl rand -base64 32`. Use a different key from
  `SSO_ENCRYPTION_KEY` and the JWT secrets.
- **Losing it makes the encrypted text unreadable, in the database and in
  every backup.** Keep a copy in a password manager outside Railway the day
  it is created. A restored backup needs this key as well as
  `BACKUP_ENCRYPTION_KEY`.

## Turning it on in production

1. Generate the key and save it in the password manager.
2. Set `DATA_ENCRYPTION_KEY` on the `@embr/api` service in Railway, and as
   the `PRODUCTION_DATA_ENCRYPTION_KEY` repository secret for the retention
   workflow. Do this **before** merging the change: without the key the new
   API deploy fails its health check and Railway keeps the previous one
   running.
3. Merge and deploy.
4. Encrypt the rows written before the change, as its own step:
   1. **Backup first.** Confirm the daily backup from the same day exists
      in the bucket (`docs/BACKUPS.md`). It is the way back if anything
      goes wrong, and it is the last backup holding this text unencrypted.
   2. **Check.** Run the "Encryption backfill (manual)" workflow with mode
      `check`. It changes nothing and prints counts per field: stored,
      encrypted, plaintext, unreadable.
   3. **Apply.** Run it again with mode `apply` and confirm `ENCRYPT`. It
      encrypts what is left and then runs the check itself.
   4. **Verify.** Run `check` once more. Done means `0 plaintext` and
      `0 unreadable` on every line; the job fails otherwise.

   The script (`src/scripts/encrypt-existing.ts`, also runnable locally
   with `DATABASE_URL` and `DATA_ENCRYPTION_KEY`, add `--check` for the
   read only pass) prints counts and never a stored value. Encrypting a
   value is not an edit, so it keeps each row's `updatedAt`, and it only
   writes a row whose text is still what it read, so an edit saved during
   the run is never overwritten. Running it twice is safe.

   Every backup taken after this step needs `DATA_ENCRYPTION_KEY` as well
   as `BACKUP_ENCRYPTION_KEY` to be readable.
