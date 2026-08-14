# Prisma Migration Readiness Audit

Conducted before any changes, per the audit-first requirement. Every
finding below was directly verified against the repository and this
sandbox's actual environment, not assumed.

## A. Current state

- **`apps/api/prisma/migrations` does not exist.** `find apps/api/prisma
-type f` returns exactly one file: `schema.prisma`. There is no
  `migration_lock.toml` either. This has been the state at every point
  in this repository's git history — there is no commit, on any
  branch, where a migrations directory ever existed. This is not a gap
  that appeared partway through; the project has never had committed
  migration history.
- **This is a known, already-documented gap**, not a new discovery:
  `docs/DEPLOYMENT.md` already states "no migration history is
  committed to this repo yet... run `pnpm db:migrate` locally once to
  generate and commit the first migration", and `README.md`'s
  quickstart already instructs a new developer to run `pnpm db:generate
&& pnpm db:migrate` as part of first-time local setup. The tooling
  (`db:migrate` -> `prisma migrate dev`, `prisma:deploy` -> `prisma
migrate deploy`) is correctly wired in `package.json` — it has simply
  never been run and its output never committed.
- **A real, previously-unnoticed consequence of this, found during this
  audit**: `.github/workflows/ci.yml`'s `test` job spins up a real
  Postgres 16 service container and runs `prisma migrate deploy`
  against it before running tests. With zero migration files present,
  `prisma migrate deploy` reports "No pending migrations to apply" and
  exits successfully — it does not error. The CI database has
  therefore never had a single table created in it, and this has never
  been visible as a CI failure because every test in this repository's
  suite mocks `../src/lib/prisma.js` and never makes a real connection
  to that database. The `test` job's real Postgres service container
  is currently provisioned but functionally unused.

## B. Schema versus migration consistency

Not applicable in the usual sense — there is no migration history to
be inconsistent with. `schema.prisma` is the sole, unambiguous source
of truth right now, and nothing in the repository or its git history
suggests the schema was ever changed via `prisma db push` or manual
SQL and left undocumented — there is exactly one schema authoring path
(hand-edited `schema.prisma`) and it has been used consistently across
every milestone this session touched (onboarding, treatment tracking,
account deletion, retention).

## C. Risk assessment: MEDIUM

Not LOW, because:

- CI's `prisma migrate deploy` step is currently misleading — it looks
  like a real migration-application check and isn't one. Anyone
  reading `ci.yml` today would reasonably but incorrectly conclude
  "migrations are applied and verified in CI."
- A first production/beta deploy that runs `prisma migrate deploy`
  against an empty migrations directory would deploy an API server
  connected to a database with zero tables — every request would fail.
  This is a real, concrete blocker for beta launch specifically, not a
  hygiene issue.

Not HIGH, because:

- There is no existing production or staging database with real data
  to reconcile against — this project has not launched yet. Generating
  an initial migration here is capturing a single, current, known-good
  schema state, not reconstructing an unknown history from a live,
  evolved database. That second scenario (real HIGH risk) does not
  apply here, and I want to be explicit that I checked for it rather
  than assumed it away: there is no DATABASE_URL pointing at anything
  but local/CI throwaway databases anywhere in this repo, and no
  evidence anywhere (docs, scripts, CI config) of a deployed
  environment holding real user data.
- The remediation is well-understood and low-complexity: generate one
  initial migration from the current schema. This is not an ambiguous
  reconstruction problem.

## D. Recommended remediation

The current state does not need reconstruction from history — it needs
a first migration generated, once, from the current schema. This is
safe because there is no prior production state to reconcile against
(see Risk assessment above).

I could not perform this step in this sandbox, and did not fake it.
Generating a real migration requires either `prisma migrate dev`
(needs a live database to diff against) or `prisma migrate diff
--from-empty` (needs the Prisma schema-engine binary either way). I
attempted this directly rather than assuming it would fail:

```
$ pnpm exec prisma generate
Error: Failed to fetch sha256 checksum at
  https://binaries.prisma.sh/.../schema-engine.gz.sha256 - 403 Forbidden

$ PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 pnpm exec prisma generate
Error: Failed to fetch the engine file at
  https://binaries.prisma.sh/.../schema-engine.gz - 403 Forbidden
```

`binaries.prisma.sh` is outside this sandbox's network egress
allowlist — this is the identical root cause behind the
`Cannot find module '../generated/prisma'` baseline typecheck errors
documented and worked around throughout this whole session. There is
no local Postgres or Docker available here either (`docker: not
found`), so there is no way to run `prisma migrate dev` as an
alternative.

I considered hand-writing an initial migration SQL file to work around
this, and deliberately did not. A hand-transcribed migration is a
guess at what Prisma's schema-engine would generate — exact index
naming, constraint naming, column ordering, and default-value SQL
syntax are all things Prisma's engine decides deterministically but
which I would be reproducing from memory/inference across roughly 15
models. A subtly wrong hand-written migration is worse than no
migration at all: it would look authoritative and pass a casual
review, while potentially deploying a schema that doesn't actually
match `schema.prisma`, silently, the first time anyone applies it. Per
this task's own instruction — stop and report ambiguity rather than
guess — this is exactly that situation, even though the cause is a
sandbox limitation rather than unknown production history.

What needs to happen, by someone with real network access (a normal
dev machine or an unrestricted CI runner — this is not a
Prisma-project-configuration problem, just a this-sandbox problem):

```bash
# Against a fresh, empty local Postgres (docker compose up first):
pnpm db:generate
pnpm db:migrate --name init
git add apps/api/prisma/migrations
git commit -m "Add initial Prisma migration"
```

This will produce `apps/api/prisma/migrations/<timestamp>_init/migration.sql`
plus a `migration_lock.toml`, both meant to be committed. Once that
exists, CI's already-correct `prisma migrate deploy` step starts doing
real work instead of silently no-op'ing.

## E. Beta deployment procedure

Once the initial migration is generated and committed (per D above), a
fresh staging/beta environment should initialize its database with:

```bash
pnpm --filter @embr/api exec prisma migrate deploy
```

This is already the correct command, already wired into `ci.yml` and
already documented as the production path in `docs/DEPLOYMENT.md` — no
new tooling is needed. `migrate deploy` (not `migrate dev`) is the
right choice for any non-local environment: it only applies
already-committed migration files in order, never generates new ones
or prompts interactively, and is safe to run repeatedly
(already-applied migrations are skipped). This should run as an
explicit deploy step before the new API version starts serving
traffic, matching the existing platform choices already documented
(Railway/Fly for API/worker).

## F. What should NOT be changed

- **`schema.prisma` itself.** Every model reviewed during this audit
  (User, Session, EmailVerificationToken, PasswordResetToken,
  AuditLog, SymptomLog, CycleEntry, Treatment, Organization,
  OrganizationMembership, OrganizationInvite,
  OrganizationSsoConnection, ClinicalBrief, OnboardingProfile) has
  correct, deliberate `onDelete` behavior already declared explicitly
  on every relation — Cascade for user-owned data, SetNull for
  AuditLog specifically so the audit trail survives account deletion.
  Every user-scoped table has an index on `userId` (several as part of
  a compound index alongside a date/timestamp field actually used in
  queries — `[userId, occurredAt]`, `[userId, date]`,
  `[userId, startDate]`, `[userId, createdAt]` — not just a bare
  single-column index). Appropriate unique constraints exist at both
  the field level (`email`, `refreshTokenHash`, `tokenHash` x3, `slug`,
  `organizationId` on the SSO table, `userId` on OnboardingProfile) and
  the compound level (`[userId, date]` on CycleEntry,
  `[organizationId, userId]` on OrganizationMembership). This is
  already correct and does not need remediation.
- **`db:migrate` / `db:generate` / `prisma:deploy` script wiring** in
  both `package.json` files — already correct, already documented,
  simply never executed.
- **`ci.yml`'s existing `prisma migrate deploy` step** — this is
  already the right command in the right place. It doesn't need to
  change; it needs migration files to exist so it has something real
  to do.

## Implementation

Per the audit above, the actual migration file cannot be safely
generated in this sandbox, and I am not fabricating one. What I can
safely do — non-destructive, doesn't touch any database, doesn't
require Prisma engine binaries — is close the "this has been silently
no-op'ing" blind spot found in section A, so it can't continue
unnoticed once this gets run in a real environment: a cheap, explicit
CI check that fails loudly if `apps/api/prisma/migrations` is empty at
the point CI would otherwise silently no-op past it. See the commit
for the exact change.
