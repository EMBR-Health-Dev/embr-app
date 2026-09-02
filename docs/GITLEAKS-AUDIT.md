# Gitleaks Secret-Scan Audit

Written after the security job's gitleaks step failed, once the preceding
pnpm-audit step had been fixed (#103) and the job could proceed far enough
to run the secret scan at all. Every finding below was reproduced locally
with gitleaks 8.30.1 against this repository's full history before
anything was changed.

## A. What failed

The `security` job in `.github/workflows/ci.yml` runs two gates in
sequence: `pnpm audit --audit-level high`, then a gitleaks scan via
`gacts/gitleaks@v1`. The job checks out with `fetch-depth: 0`, so the
gitleaks step scans every commit in history, not just the PR diff.

Two sequencing facts explain the timeline. First, while the audit step
was red, the gitleaks step never ran at all — a failed step fails the
job and the remaining steps are skipped. Second, once the audit fix
merged, the first run to reach the scan step failed there instead. So
this was not a new leak appearing; it was the next buried gate surfacing.

The failing CI run reported `204 commits scanned ... leaks found: 2`.
Local reproduction on post-merge main (215 commits at the time) found the
identical pair, and the local scan's history is a superset of the CI
run's, so the CI findings are the same two described below. The commit
count differs with checkout state; the finding set does not.

## B. The two findings

Both are test fixtures, not credentials:

1. `apps/api/test/setup.ts:21` — rule `stripe-access-token`. The
   test-setup file assigns a fake `STRIPE_SECRET_KEY` placeholder so
   `isBillingConfigured()` returns true in route tests; the `stripe`
   package is mocked wherever billing behavior is actually exercised
   (see the comment block above the line). The rule pattern-matches on
   the `sk_` prefix and cannot distinguish a documented dummy from a
   live key. Introduced by cde6fce ("feat: add Stripe billing and seat
   purchase flow", 2026-08-24).
2. `apps/mobile/lib/reset-token.test.ts:14` — rule `generic-api-key`.
   A test URL of the shape `...reset-password?token=<hex fixture>`
   exercises `extractToken`'s query-parameter parsing. The low-entropy
   fixture value trips the generic rule. Introduced by 365a586 ("Add
   password recovery flow for web and mobile", 2026-08-22).

Per docs/INCIDENT_RESPONSE.md, a real caught leak means rotation. No
rotation applies here: both strings exist solely to satisfy env
validation and to drive parsers under test, as documented inline in the
files themselves.

## C. Why the obvious fixes don't work

- **Inline `gitleaks:allow` comments at HEAD**: the findings are pinned
  to the commits that introduced the lines, not to HEAD. With a
  full-history scan, a comment on today's copy of the line suppresses
  nothing; the scan still reports the historical commits.
- **Rewriting the fixture strings**: a new commit changing them adds
  new secret-shaped lines to history, which produces new findings with
  new fingerprints. That path converts 2 permanent findings into 2 old
  plus N new ones. The fixtures at HEAD are correct and stay.
- **History rewrite (filter-repo/BFG)**: the only way to make the
  findings truly disappear, and not worth it for dummy test values —
  it would also invalidate every existing clone.

## D. The fix

`.gitleaksignore` at the repo root: gitleaks' native mechanism for
suppressing specific findings by fingerprint
(`<commit>:<path>:<rule>:<line>`). Fingerprints exist since gitleaks
8.10.0 and the ignore file is documented in the 8.17-era README;
`gacts/gitleaks@v1` installs the latest release (no version is pinned
in ci.yml), so the file is honored.

The committed file contains exactly two fingerprint lines, generated
from the machine-readable report rather than hand-typed — a mistyped
sha or line number silently fails to suppress:

```bash
gitleaks git --report-format json --report-path /tmp/gl.json || true
jq -r '.[].Fingerprint' /tmp/gl.json > .gitleaksignore
```

Then re-scan (`gitleaks git`) and confirm exit 0 before committing.

## E. Verification

- Full-history scan with the file present: `no leaks found`, exit 0.
  Tested both with and without the `#` header comment, since comment
  support in `.gitleaksignore` has varied across gitleaks releases —
  verified on 8.30.1, not assumed.
- The suppression is fingerprint-scoped. A new leak — including a real
  Stripe key pasted into any file — still fails the job.

## F. Maintenance

Unlike the `auditConfig.ignoreCves` entries in package.json (delete
once image-size ships a patched release), these two entries are
permanent for as long as the introducing commits remain in history.
If a future history rewrite ever purges them, delete the corresponding
lines; a clean scan confirms they are no longer needed.

If the gate goes red again: run the two commands in section D and diff
the output against the committed file. Unknown fingerprints are a new
finding, not noise — triage it before adding it. This file is an
allowlist for reviewed false positives, not a general mute button.
