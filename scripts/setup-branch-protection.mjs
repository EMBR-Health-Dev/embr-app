#!/usr/bin/env node
// Configures branch protection on `main` via the GitHub REST API.
//
// This is a script you run once from your own machine, not a CI job —
// it needs a personal access token with repo admin rights, which is
// exactly the kind of credential that shouldn't live in a workflow that
// runs on every PR.
//
// Usage:
//   GITHUB_TOKEN=ghp_xxx node scripts/setup-branch-protection.mjs
//   GITHUB_TOKEN=ghp_xxx node scripts/setup-branch-protection.mjs --repo tiy1/embr-app --branch main
//
// GITHUB_TOKEN needs the "repo" scope (classic PAT) or "Administration:
// write" (fine-grained PAT) on this repository.

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const repo = argValue("--repo", "tiy1/embr-app");
const branch = argValue("--branch", "main");
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error("GITHUB_TOKEN env var is required (a PAT with admin rights on this repo).");
  process.exit(1);
}

// Mirrors the job names in .github/workflows/ci.yml — if you rename a
// job there, update this list too, or branch protection will silently
// wait forever on a check that no longer reports.
// Corrected 2026-08-24: the previous list ["Lint & Typecheck", ...]
// contained a stale check name — the CI workflow was split into
// separate "Format Check", "Lint", and "Typecheck" jobs at some point
// and this constant was never updated. Verified against the actual
// check-run names GitHub reports on the latest main commit before
// making this change.
const requiredStatusChecks = [
  "Format Check",
  "Lint",
  "Typecheck",
  "Unit & Integration Tests",
  "Security & Dependency Scan",
  "Build All Apps",
];

const body = {
  required_status_checks: {
    strict: true, // require branches to be up to date with main before merging
    checks: requiredStatusChecks.map((context) => ({ context })),
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
  },
  restrictions: null, // no push/merge restriction beyond the review requirement
  required_linear_history: false,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
};

const url = `https://api.github.com/repos/${repo}/branches/${branch}/protection`;

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!response.ok) {
  const detail = await response.text();
  console.error(`Failed to set branch protection (${response.status}): ${detail}`);
  process.exit(1);
}

console.log(`✅ Branch protection applied to ${repo}@${branch}:`);
console.log(`   - Required checks: ${requiredStatusChecks.join(", ")}`);
console.log("   - 1 approving review required, stale reviews dismissed on new commits");
console.log("   - Force pushes and branch deletion blocked");
console.log("   - Conversation resolution required before merge");
console.log("   - Rules also apply to admins (enforce_admins: true)");
