# Ownership / IDOR Audit

Systematic review of every user-scoped and org-scoped resource in the
API for insecure direct object reference (IDOR) — whether a caller can
read, modify, or delete a resource they don't own by supplying an id
that isn't theirs.

## Methodology

1. Listed every route with an `:id`-shaped path param, across every
   module.
2. For each, traced the full path from route → service → repository →
   actual Prisma query, checking whether the single-record lookup is
   scoped to the caller's identity (`userId`, or org membership for
   org-scoped resources) or just the bare `id`.
3. Ran `grep -rn "findUnique\|findFirst"` across every
   `*.repository.ts` as a second, independent pass — catches anything
   a route-by-route review might miss, since it doesn't rely on
   already knowing which routes exist.
4. For every bare-`id` lookup found (not compound-scoped), traced its
   call site(s) to confirm the `id` either comes from the caller's own
   already-authenticated identity, an unguessable token/state value
   (the correct access-control mechanism for invite/verification
   flows), or a prior middleware check that already authorized the
   specific resource.
5. Checked existing test coverage for explicit cross-user isolation
   tests, and added the ones that were missing.

## Findings: user-scoped resources (symptoms, cycle, treatments, briefs)

**Already correct, consistently, across independently-built modules.**
`symptom.repository.ts`, `cycle.repository.ts`, `treatment.repository.ts`,
and `brief.repository.ts` all follow the identical pattern: every
single-record lookup is `findFirst({ where: { id, userId } })`, and
every update/delete uses `updateMany`/`deleteMany` with the same
compound `where` — specifically so a non-owned id affects zero rows
and returns null, rather than throwing Prisma's "record not found"
error (a different code path that could otherwise behave detectably
differently for someone probing whether an id exists at all). The
route layer consistently returns a plain 404 either way, never a 403 —
a non-owned id and a nonexistent id are indistinguishable to the
caller, which is the correct behavior: confirming "this id exists but
isn't yours" is itself a small information leak.

**Fixed, not a vulnerability but a real coverage gap**: symptoms,
cycle, and treatments all had explicit cross-user isolation tests for
GET and PATCH, but none had one for DELETE specifically. The
underlying implementation was already correct (verified by direct
code inspection before writing any test), but an already-correct
implementation with no regression test for one of its three
operations is exactly the kind of gap that stays fine until someone
refactors `deleteMany` into something else years from now with no test
to catch it. Added one test per module (`symptom.test.ts`,
`cycle.test.ts`, `treatment.test.ts`) that does more than assert 404:
it also confirms the resource is still readable by its real owner
afterward — proving the failed delete attempt affected zero rows, not
just that it returned the right status code.

## Findings: org-scoped resources

**`requireOrgRole` (`auth.middleware.ts`) is correctly implemented.**
Every `/organizations/:organizationId/*` route requiring org-specific
access uses this middleware, which looks up the caller's membership by
the compound key `{ organizationId (from the URL), userId (from the
verified session) }` — not just "does this user have _some_ org role
somewhere." A user with no membership in the target org gets 404; a
member with the wrong role (e.g. `ORG_MEMBER` on an `ORG_ADMIN`-only
route) gets 403. This is genuinely correct per-org access control, not
just per-user.

**`GET /organizations/:organizationId`** uses an authorize-then-fetch
pattern (`requireOrgRole` in middleware, then a bare `findUnique({id})`
in the repository) rather than compound-scoping the query itself —
a different but equally valid pattern _as long as every call site is
protected_. Confirmed: `organizationService.getOrganization` has
exactly one call site in the entire codebase, and it's this route,
immediately preceded by `requireOrgRole`.

**Invite tokens and consumption** (`findValidInvite`,
`consumeInvite`) are correctly scoped by an unguessable `tokenHash`,
not by a caller identity at all — the correct access-control model for
an invite link (possession of the emailed link _is_ the authorization),
matching the same pattern already used for password-reset and
email-verification tokens.

**SSO connection lookup by bare id** (`ssoRepository.findById`) has
exactly one call site, inside `ssoService`, using a `connectionId`
read from a server-generated "pending SSO state" record (created
during `/auth/sso/start`, keyed by a random `state` value from the
OAuth flow) — never a user-suppliable route param. Not exposed to
caller manipulation.

## Findings: platform-admin resources

**`/admin/*` is gated at the router level**:
`router.use("/admin", requireAuth(), requireRole("ADMIN"))` — applied
once, above every route in the file, rather than per-route. This is
the safer pattern by construction: a new admin route added later
can't accidentally be registered without the check, the way it could
if each route needed to remember to add `requireRole("ADMIN")`
individually.

## What this audit did NOT need to fix

No IDOR vulnerabilities were found. Every gap identified was a test-
coverage gap on top of already-correct implementation, not an actual
access-control bug — this audit's job was to confirm that
systematically, not just take it on faith from consistent-looking
code.

## Tests added

- `symptom.test.ts`: DELETE cross-user isolation
- `cycle.test.ts`: DELETE cross-user isolation
- `treatment.test.ts`: DELETE cross-user isolation

Each confirms both the 404 response _and_ that the resource is still
present and owner-readable afterward — the stronger assertion, since a
plain 404 alone wouldn't distinguish "correctly blocked" from "deleted
anyway but the response was wrong."
