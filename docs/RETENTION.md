# Data Retention

## What exists

- `apps/api/src/modules/retention/` — deletes rows that are already
  functionally dead: `Session` rows past their `expiresAt` (or revoked
  and past a grace period), and `EmailVerificationToken`/
  `PasswordResetToken` rows past their `expiresAt`. A 30-day grace
  period beyond raw expiry (`RETENTION_GRACE_PERIOD_DAYS`, default 30)
  exists for two reasons: clock skew between this process and whatever
  issued the row, and keeping a recently-expired session/token on hand
  briefly for incident investigation ("did this expire naturally, or
  was it revoked because of something") rather than deleting the
  moment it's no longer usable.
- `apps/api/src/scripts/retention-cleanup.ts` — the script that runs
  the above, invoked via `pnpm --filter @embr/api exec tsx
src/scripts/retention-cleanup.ts`.
- `.github/workflows/retention.yml` — runs the script weekly (Mondays,
  03:30 UTC), matching `backup.yml`'s pattern of a plain script
  triggered by a scheduled workflow rather than a new always-running
  service.

None of the tables this touches contain health data or plaintext
PII — tokens are stored hashed, and sessions carry no symptom/cycle/
onboarding/brief content. This is operational hygiene (don't let dead
rows accumulate forever), not itself a privacy-critical deletion path;
account-level deletion of real user data is handled separately (see
the account deletion feature — `DELETE /auth/me`).

## What this deliberately does NOT touch, and why

**`AuditLog`** — no automatic pruning, no default expiry. This is an
explicit decision, not an oversight: audit trail retention is a
compliance/security policy question ("how long do we need to be able
to investigate an incident from") that shouldn't be decided by
default inside an engineering task. Every entry already avoids storing
health data or plaintext PII beyond what's needed for the audit
purpose itself (IDs, timestamps, IP/user-agent for security events —
see `apps/api/src/modules/auth/audit.ts`), so there's no urgency
driving this the way there would be for, say, raw health data sitting
around indefinitely. **Before enabling any AuditLog pruning**, this
needs a real decision from whoever owns compliance/security posture
for EMBR on the actual required retention window — once that's
decided, it's a small addition to `retention.repository.ts` following
the exact same pattern already established here.

**Account-level user data** (symptom logs, cycle entries, briefs,
treatments, onboarding answers) — retained indefinitely unless the
user explicitly deletes their account. This is intentional: the
product's entire value proposition is a longitudinal record, so there
is no "this symptom log is old, delete it" policy, and shouldn't be
one implemented as a side effect of an unrelated cleanup task.

## What must be configured externally

- The GitHub Actions secrets referenced in `retention.yml`:
  `PRODUCTION_DATABASE_URL`, `PRODUCTION_REDIS_URL`,
  `PRODUCTION_JWT_ACCESS_SECRET`, `PRODUCTION_JWT_REFRESH_SECRET`,
  `PRODUCTION_SSO_ENCRYPTION_KEY`, `PRODUCTION_ANTHROPIC_API_KEY`. Most
  of these aren't functionally used by the retention script itself —
  they're required because the script imports this app's shared
  `env.ts`, which validates every required env var at import time
  regardless of which specific script is running. If a real deploy
  pipeline already populates these same secrets for other purposes,
  reuse them here rather than creating duplicates.
- A real decision on `RETENTION_GRACE_PERIOD_DAYS` if 30 days isn't
  the right window for this product/jurisdiction — configurable via
  env var, no code change needed to adjust it.
- The AuditLog retention decision described above, whenever that's
  ready to be made.

## Relationship to backups

Retention (this doc) and backups (`docs/BACKUPS.md`) are separate
concerns that can pull in opposite directions if not thought through
together: retention deletes rows from the live database, while a
backup taken _before_ that deletion still contains them. This is
expected and fine for the rows this cleanup actually touches (dead
sessions/tokens have no value in a restored backup either), but is
exactly why AuditLog pruning needs a real retention-window decision
before it's ever enabled — an audit trail's value in an incident often
comes specifically from an _old_ backup still having it.
