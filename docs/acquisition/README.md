# Acquisition Documentation

This folder is the acquirer-facing complement to the engineering
documentation already in `docs/` — it does not replace it. Where a fact
is already correctly and currently documented elsewhere (deployment
topology, backup mechanics, engineering conventions), a file here links
to it rather than re-deriving or copying it. Two sources of truth for
the same fact drift; one doesn't.

**Already current and accurate — read these first, not a summary of them:**

- `docs/ARCHITECTURE.md` — internal engineering conventions and request
  lifecycle.
- `docs/DEPLOYMENT.md` — actual deployment topology, platform choices,
  secrets management, rollback strategy, production configuration
  checklist.
- `docs/BACKUPS.md` — the real, currently-running Postgres backup
  mechanism (see `architecture.md` in this folder for why this matters
  for diligence specifically).
- `docs/audits/` — point-in-time security/readiness audits, each dated
  and marked when superseded. Treat every finding's date as load-bearing
  — an audit from a month ago is a historical record, not current status,
  and this repo's own audits say so explicitly where they've been
  re-verified.

## What exists here

- `architecture.md` — the system as an acquirer would need to understand
  it: what's proprietary, what's third-party, what's replaceable, and
  what creates switching cost. New content, not covered elsewhere.

## What's intentionally not here yet

A data asset register, IP register, cap table, financials, contracts
register, and an acquisition kill list all need facts only the founder
has — actual consent copy as shipped, actual invention-assignment
paperwork, actual financial records, actual signed agreements. Drafting
those from assumption would produce a document that reads as complete
diligence material while actually being fabricated placeholder content,
which is worse than not having the document at all. These get written
once the underlying facts are supplied, not before.
