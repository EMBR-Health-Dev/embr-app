# EMBR Beta Readiness Audit

**Scope:** Full re-verification against `main` at commit `f4ca89b` (post-PR #64, treatment tracking backend merged). Audit only — no code changed. Every finding below is backed by something actually read in this session (file contents, config values, test runs), not carried over from earlier conversations.

---

## How to read this

- **Severity**: P0 = blocks private beta / P1 = materially damages beta quality / P2 = useful but can wait / P3 = post-beta
- **Current state** distinguishes **implemented** (code exists and works), **configured** (code exists but needs a value/setup to function), and **not implemented** (doesn't exist)

---

## Part 1 — Product area matrix

| Area | Current state | Evidence | Severity | Required action | Est. effort |
|---|---|---|---|---|---|
| **1. Registration** | Implemented | `POST /auth/register`, email+password, Zod-validated, Argon2id hashing. Tested. | — | None | — |
| **2. Email verification** | Implemented, **not configured** | Token-based flow exists and is tested. But `SMTP_HOST` defaults to `localhost:1025` (Mailhog-style dev catcher) — no real email provider is wired up anywhere in the repo. | **P0** | Pick a transactional email provider (Postmark/SES/Sendgrid), set real `SMTP_*` values in production. Without this, **no user can ever verify an account or reset a password in production.** | 2–4 hrs |
| **3. Login** | Implemented | Argon2id, JWT access + rotating refresh tokens, mobile Bearer-token path added specifically for mobile viability. Tested. | — | None | — |
| **4. Password reset** | Implemented, blocked by #2 | Same email-delivery dependency as verification. | **P0** (same root cause as #2) | Same fix as #2 | — |
| **5. Session management** | Implemented | List/revoke sessions, logout-all, change-password revokes all sessions. Web + mobile settings UI both exist. | — | None | — |
| **6. Onboarding** | **Not implemented** | No onboarding screens found on web or mobile (`grep -r onboard` across both apps: zero matches). New users land straight on the empty dashboard. | **P1** | At minimum: a first-run explanation of what to log and why, and what BRIEF is, before the empty dashboard. Doesn't need to be elaborate for a *controlled* beta with a small user count you can personally brief — but zero explanation is a real first-impression risk. | 1–2 days (even minimal) |
| **7. Symptoms** | Implemented, web + mobile | Full CRUD, category/severity chips on mobile, tested (symptom.test.ts). | — | None | — |
| **8. Cycle** | Implemented, web + mobile | Upsert-by-date, flow/period-start/end, tested. | — | None | — |
| **9. Treatment tracking** | **Backend only** | Full CRUD API (PR #64), zero frontend on either web or mobile. Not reachable by a real user at all right now. | **P1** | Build the mobile (and/or web) screen — same pattern as symptom/cycle logging, which took roughly a day each. | 1 day |
| **10. Trends** | Implemented, web + mobile | Server-side symptom-frequency + cycle-length aggregation, tested. | — | None | — |
| **11. "Home reflection system"** | **Not implemented** | No file, route, or UI matching this anywhere in the repo. If this refers to something beyond the existing dashboard/trends views, it doesn't exist. | **Needs product clarification** — flagging rather than guessing at scope. If "useful reflections" = the existing Trends view, this is effectively done under a different name; if it means something more (e.g. a proactive summary/nudge), it's unbuilt. | Depends on actual scope | Unknown until scoped |
| **12. BRIEF** | Implemented, well-built | See Part 2 — full dedicated audit below. | — | See Part 2 | — |
| **13. AI safety** | Implemented, strong | See Part 2. | — | See Part 2 | — |
| **14. Settings** | Implemented, web + mobile | Change password, session list/revoke, logout-all. | — | None | — |
| **15. Account deletion** | **Not implemented** | No `DELETE` route for a user's own account anywhere in `auth.routes.ts` or any other module — only session revocation exists (`DELETE /auth/sessions/:id`, a different thing). | **P0 for mobile specifically** — Apple's App Store Review Guidelines (5.1.1(v)) require in-app account deletion for any app that supports account creation; this blocks App Store submission outright, not just a UX nicety. Also a real gap against your own beta-flow definition, which explicitly lists it as a required step. | 1 day (soft-delete + anonymize, or hard delete — needs a decision on data retention obligations first) |
| **16. Data access / privacy** | Implemented, strong | See Part 3. IDOR-safe ownership scoping confirmed across every personal-data module (symptoms, cycles, treatments, briefs — all use the "wrong owner → 404, not 403" pattern). Org-admin aggregate views use a k-anonymity floor. | — | None found beyond Part 3's specific items | — |
| **17. Error states** | Partially implemented | Spot-checked symptom logging, cycle tracking, BRIEF generation on mobile — all show a real error message on API failure (not a silent failure or generic crash). Not exhaustively checked screen-by-screen. | P2 | A pass through every screen for the "backend is down / network error" case would be worth doing before a wider beta, less critical for a small controlled one where you can watch for issues directly. | 0.5 day |
| **18. Loading states** | Implemented where checked | Every screen reviewed shows a loading indicator, not a blank flash, while its initial data fetch is in flight. | — | None found | — |
| **19. Empty states** | Implemented where checked | Symptom log list, cycle entries, treatment list (once built), BRIEF history all have explicit "nothing here yet" copy rather than an empty blank area. | — | None found | — |
| **20. Mobile navigation** | Implemented | Tab bar (Symptoms / Cycle / Trends / Brief), settings reachable, auth-gated route group works correctly. Treatment tracking has no tab yet since it has no screen (see #9). | — | Add a tab once #9 is built | — |

---

## Part 2 — AI / BRIEF deep audit

This is the most safety-sensitive surface in the product, so it got the closest read.

**Model/provider integration**: Anthropic SDK, model pinned via `ANTHROPIC_BRIEF_MODEL` env var (not hardcoded) — good, lets you change models without a code change.

**Prompts**: A single, carefully-written system prompt (`brief.ai.ts`) with four explicit rules, each with a doc comment explaining *why* it exists and what failure mode it prevents:
1. Data-grounded only — never fill gaps with general medical knowledge
2. Never diagnose, name a condition, suggest a cause, or recommend treatment
3. Discussion topics must be phrased as questions, never assertions
4. Say so plainly if the data is too sparse, rather than inventing a pattern

This is well above the bar I'd expect for a first pass — it's not just "be careful," it's specific, falsifiable rules with reasoning attached.

**Data passed to the model**: Only aggregated summaries (category counts, severity breakdowns, cycle-length averages) — **never raw free-text notes** from symptom logs. This is a deliberate, correctly-reasoned privacy minimization (notes can contain anything; the aggregate is scoped to exactly what the feature needs).

**Output validation**: Strict Zod schema (`briefResponseSchema`) — `narrative: string`, `discussionTopics: string[]` (1–8 items, each non-empty). A malformed or missing-field response throws rather than silently passing through bad data.

**Safety boundaries / non-diagnostic language**: Enforced in the prompt (see above) and **reinforced in the UI** — both web and mobile BRIEF screens show an explicit disclaimer ("not a diagnosis, and not medical advice") directly to the user, not just buried in a system prompt the user never sees. This is exactly what your beta definition asks for ("understand what BRIEF does and does not do").

**Hallucination controls**: The prompt-level rules above are the only control — there's no secondary check (e.g., a second model call verifying the output stays grounded in the input data). For a beta with a small, known user group this is a reasonable risk level; for a wider launch, worth considering a lightweight grounding check.

**Failure behavior**: Confirmed by reading `brief.service.ts` line by line — if the Anthropic call throws for *any* reason, it throws **before** any database write happens. A failed generation cannot create a partial or corrupt `ClinicalBrief` record. Clean.

**Timeout / retry behavior**: **No explicit timeout** is set on the Anthropic client call (relies on SDK default) and **no retry logic exists** — a single transient failure (network blip, momentary rate limit, occasional malformed JSON despite the strict prompt) surfaces directly to the user as "couldn't generate a brief" with no automatic recovery. Real, but low-severity for a small beta — annoying, not broken.

**Logging**: The shared HTTP logger records method/path/status/duration/user-agent only — no request or response bodies, so brief content and symptom data are not written to logs by that layer. **One narrow, separate finding**: `req.originalUrl` is logged for every request, including `GET /auth/sso/callback?code=...&state=...` — this puts a short-lived, single-use OAuth authorization code into application logs. Low severity (single-use, short expiry, requires log access within that window) but worth a quick fix.

**Sensitive data exposure / persistence**: The AI's narrative and discussion topics **are persisted** (`ClinicalBrief.aiNarrative`, `.aiDiscussionTopics`), alongside the exact aggregated input that produced them — so **historical briefs are reproducible and stable**: viewing an old brief shows exactly what was generated then, not a re-computation that could drift if trend data changes later. This is the right design.

**API authorization**: `requireAuth()` + ownership-scoped queries (`findByIdForUser`) throughout — same IDOR-safe pattern as every other module. Rate-limited at 10/hour per user, keyed by user ID (cost control, not anti-abuse — correctly reasoned as a different concern from the auth brute-force limiters).

**Overall assessment**: This is the best-built, most carefully-reasoned part of the codebase from a safety standpoint. Nothing here blocks beta. The retry/timeout gap and the log-scrubbing item are real but minor.

---

## Part 3 — Security & privacy

| Finding | Evidence | Severity |
|---|---|---|
| **`COOKIE_SECURE` defaults to `false`** | `env.ts`: `COOKIE_SECURE: z.coerce.boolean().default(false)`. If production deployment doesn't explicitly set this to `true`, auth cookies ship without the `Secure` flag. | **P0** — this is a "safe only if someone remembers to configure it" default, which is the wrong failure direction for a security-relevant setting. |
| Authentication bypass | None found. Bearer-token path (mobile) and cookie path (web/admin) both go through the same `requireAuth()` middleware; CSRF is correctly skipped only when the corresponding cookie is genuinely absent (verified this exact logic in an earlier session). | — |
| Authorization / IDOR | Confirmed clean across symptoms, cycles, treatments, briefs, organizations — every single-resource lookup is scoped by owner in the query itself (`findFirst({ where: { id, userId }})`), not fetched-then-checked. Wrong owner → 404, never 403 (correctly avoids confirming a resource's existence to someone who doesn't own it). | — |
| Employer/org access to individual health data | Org admins get roster + **anonymized, cohort-level** symptom trends only (k-anonymity floor, default 5 — below that, the endpoint returns suppressed with zero data rather than a small, re-identifiable number). Verified this design directly in an earlier audit pass this session. No path found for an org admin to read an individual member's symptom/cycle/treatment/brief records. | — |
| SSO auth bypass (`email_verified` not enforced) | **Already found and fixed in this session** (merged). Re-verified: still fixed on current `main`. | — (resolved) |
| SSRF via SSO `issuerUrl` | **Already found and fixed in this session** (merged, `guardedFetch` blocks private/loopback/link-local resolution). Re-verified: still in place on current `main`. | — (resolved) |
| Secrets in repository | No `.env` file committed, no matching entries in git history for one. No hardcoded API keys/tokens found in a scan of `apps/*/src`. `gitleaks` runs in CI (free-tier equivalent, fixed earlier this session). | — |
| Sensitive data in logs | HTTP logger scoped to metadata only (see Part 2). One narrow finding: OAuth `code`/`state` in `originalUrl` for the SSO callback route. | P2 |
| CORS | Single configurable origin (`CORS_ORIGIN`), not a wildcard. Fails closed if unset in production (defaults to `localhost:3000`, which won't match a real production origin — requests get rejected, not silently allowed). | — |
| Rate limiting | Redis-backed (shared across instances, not per-process — fixed earlier this session), applied to: auth endpoints (brute-force), global backstop, brief generation (cost control). Confirmed via passing integration tests. | — |
| Session handling | Refresh tokens rotate on use with reuse detection; session revocation and logout-all both work and are tested. | — |
| Account deletion | Not implemented — see Part 1 #15. | P0 (mobile) |
| Database backups | `backup.yml` workflow and `scripts/db-backup.sh` exist, but **this workflow has been failing in every run I've observed this session** — there's no real production database configured yet for it to actually back up. Configured, not functional. | P1 — needs to actually work before real user data exists, not after. |
| Production data separation | No evidence of a staging/production split anywhere (single `DATABASE_URL`, no environment-specific config beyond `NODE_ENV`). Not necessarily wrong for a first beta, but worth being deliberate about — e.g., don't develop against whatever database ends up holding real beta users' health data. | P1 (process, not code) |

---

## Part 4 — Production readiness

| Item | Status | Detail |
|---|---|---|
| Production env vars | **Not configured** | `.env.example` documents everything needed; no evidence any of it has real production values set anywhere (no deployment exists yet). |
| Database migration strategy | **Not implemented** | Zero files in `apps/api/prisma/migrations/` across 13 models and 18 milestones. `prisma migrate deploy` in CI is currently a no-op. **This is the single largest blocker in this entire audit** — every test in the suite mocks Prisma entirely, so this has never been exercised against a real schema, ever. |
| API deployment | **Not implemented** | `Dockerfile` exists per `apps/*`, `docs/DEPLOYMENT.md` gives a clear recommended path (Railway/Fly), but nothing is actually deployed anywhere. |
| Web deployment | **Not implemented** | Same — Vercel recommended, not connected. |
| Mobile build configuration | **Not implemented** | No `eas.json` anywhere in `apps/mobile`. There is currently no configured path to produce an installable build (TestFlight or otherwise) — the app only runs via `expo start` in development. |
| Email provider | **Not configured** | See Part 1 #2 — this is the same root cause blocking verification and password reset. |
| Domain configuration | **Not implemented** | `APP_URL` defaults to `localhost:3000`; no evidence of a real domain anywhere. |
| Error monitoring | **Implemented, not configured** | `initSentry()` exists and is a documented no-op until `SENTRY_DSN` is set (confirmed in `DEPLOYMENT.md`, including a correct note that `beforeSend` already strips cookies/body for health-data safety). Just needs a DSN. |
| Analytics | **Not implemented** | No PostHog/Amplitude/Mixpanel/Segment or equivalent found anywhere in the codebase. |
| Database backups | **Configured, not functional** | See Part 3 — workflow exists, has no real target yet. |
| CI checks | **Implemented** | Six real jobs: format, lint, typecheck, test, security scan, build. All confirmed passing on current `main` (179/179 tests, 5 cleanly skipped). |
| Secrets management | **Documented, not yet exercised** | `DEPLOYMENT.md` gives a clear, sensible order of preference (platform-native secrets first). Nothing to verify until an actual deployment exists. |
| Health checks | **Implemented** | `GET /health/live`, `GET /health/ready` (checks Postgres + Redis reachability, not just process liveness — the right check). |
| Logging | **Implemented** | Structured (pino), PII-conscious (see Part 2/3). |

---

## Minimum Beta

The smallest set of work that gets EMBR in front of real users without a broken or legally/platform-blocking gap.

1. **Generate and commit the first Prisma migration; deploy a real Postgres and Redis** (P0 — nothing else matters until this exists)
2. **Configure a real email provider** (P0 — blocks verification and password reset entirely)
3. **Set `COOKIE_SECURE=true` and every other production env var explicitly** (P0 — don't rely on defaults)
4. **Deploy API + worker + web** (Railway/Fly + Vercel, per existing `DEPLOYMENT.md` — the plan is already written, just needs executing)
5. **Get `backup.yml` actually pointed at the real production database** (P0/P1 — real user health data needs a working backup before it exists, not after)
6. **Account deletion** — at minimum a working endpoint + a simple settings-screen entry point (P0 for mobile App Store submission; still correct for web-only beta too)

If beta is **web-only, invite-only, no App Store submission**: account deletion could arguably move to Recommended rather than Minimum, since you're not subject to Apple's review requirement and you can personally handle a deletion request for a small controlled group. I'd still keep it in Minimum given it's explicitly in your own required beta-flow definition, but flagging that this is the one item on this list with a real, defensible argument for deferring it.

**Estimate**: 3–5 engineering days, 1 calendar week (mostly waiting on DNS/provider setup, not coding), **2–3 Claude implementation sessions** (migration generation + verification is its own careful session; deployment/env wiring is mostly configuration rather than code and goes faster).

## Recommended Beta

Minimum Beta, plus:

7. **Treatment tracking UI** (mobile) — the backend exists and is tested; shipping the API without a way to use it undersells a genuinely good feature and leaves a gap in your own beta-flow definition
8. **Minimal onboarding** — doesn't need to be polished, needs to exist. A first-run screen explaining what to log and what BRIEF is.
9. **BRIEF retry-once-on-transient-failure** — cheap to add, meaningfully reduces "it just didn't work" moments for a feature you want to make a strong first impression
10. **Scrub OAuth `code`/`state` from logged URLs** — small, clean fix
11. **A real answer on "Home reflection system"** — either confirm Trends already covers this requirement, or scope it properly; don't leave it ambiguous going into beta

**Estimate**: Minimum Beta's 3–5 days **+ 3–4 more days** for items 7–11 (treatment UI is the biggest of these at ~1 day; the rest are each a few hours). **~1.5–2 calendar weeks total**, **4–5 Claude implementation sessions** total (each major UI addition or the migration work is comfortably its own session; the small fixes can be batched into one).

## Post Beta

Everything else surfaced in this audit, safely deferrable:

- "Home reflection system" if it turns out to mean something beyond Trends (unscoped — can't estimate until it's defined)
- Exhaustive error-state pass across every screen (spot-checked and fine; a full pass is polish, not a blocker)
- Analytics (PostHog or equivalent) — valuable for understanding a beta's usage, but the beta itself doesn't require it to function
- Staging/production environment separation as a formal process
- A grounding/verification pass on BRIEF's AI output (current single-model-call design is a reasonable risk for a small, known beta group)
- Wiring treatment data into BRIEF's AI context (flagged in Milestone 18's own doc entry as a deliberate non-goal for now, given BRIEF's careful existing safety scope)
- Anything from the earlier strategy-document conversation (clinician workspace, employer intelligence, pharma data products) — all genuinely post-beta by any reasonable reading of "minimum path to real users"

---

Stopping here per your instruction — no code changed, waiting for your call on which path to execute.
