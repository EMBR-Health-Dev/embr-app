# Dependency audit exceptions

CI's Security & Dependency Scan runs `pnpm audit --audit-level high` and
fails the build on any HIGH or CRITICAL advisory. This file tracks the
only advisories exempted from that gate, why, and how — so an exemption
here is never silent, never broad, and never grows without a matching
update to this document.

The exemption mechanism is `pnpm.auditConfig.ignoreGhsas` in the root
`package.json` (supported natively by pnpm ≥ 9.x — verified against the
exact pnpm version this repo pins in CI). It suppresses only the exact
GHSA IDs listed; `--audit-level high` is untouched, and every other
advisory — including any newly introduced one, at any severity from
`moderate` up depending on the command's own `--audit-level` — still
fails the audit exactly as before. This was verified directly: with the
exemption active, `pnpm audit --audit-level moderate` still correctly
fails on an unrelated, non-exempted moderate finding
(`@opentelemetry/core`, GHSA-8988-4f7v-96qf) — the mechanism suppresses
by advisory identity, not by lowering any severity bar.

## Currently exempted

### GHSA-w3rx-r6r6-pgpr / CVE-2025-71330 — image-size, ICNS parser DoS

### GHSA-5p2g-fcmc-qvqq / CVE-2025-71329 — image-size, JXL/HEIF parser DoS

Both: HIGH severity, package `image-size@1.2.1`, vulnerable range
`<=2.0.2`, **`patched_versions: <0.0.0`** in the advisory data — no
fixed release exists upstream at all, for either advisory, as of this
writing. `pnpm.overrides` (used elsewhere in this file for exactly this
purpose — see `nanoid`, `deepmerge-ts`, `uuid`) can't help here: there
is no non-vulnerable version to override to.

**Why these two are safe to exempt, not just unfixable:**

- `image-size` is reachable **only** through
  `apps/mobile → expo → @expo/cli → @expo/metro / metro → image-size`
  (confirmed via `pnpm why image-size --recursive`). `metro` is the
  Expo/React Native JS bundler — build-time Node.js tooling that runs
  during `expo start`/`eas build`, not code that ships inside the
  compiled app or its JS bundle.
- Confirmed absent from every other workspace: `pnpm --filter @embr/api
why image-size`, `--filter @embr/web`, `--filter @embr/admin`, and
  `--filter @embr/worker` each return nothing. This is a mobile
  build-tooling-only dependency chain.
- Confirmed no application source anywhere in `apps/mobile` imports
  `image-size` or `metro` directly — the only code paths that reach it
  are Metro's own internal asset-dimension probing (used for `@2x`/
  `@3x` image resolution during bundling), never application logic.
- The vulnerable code path only ever processes image files already
  present in the mobile app's own source tree at build time (app
  icons, splash screens, static assets checked into the repo) — never
  runtime user-uploaded content, and never anything reachable by an
  external, unauthenticated party. Worst case if ever triggered: a
  local/CI build process hangs. Not a shipped-app or production-runtime
  risk.

**Revisit when:** a patched `image-size` (or a `metro`/`@expo/cli`
release pulling one in) becomes available upstream — re-run
`pnpm audit`, and if these no longer appear, remove both entries from
`ignoreGhsas` in the same change that confirms it.

## Adding a new exception

Every future entry here must include: the exact GHSA ID(s) and CVE(s),
the affected package and vulnerable/patched version ranges, the full
dependency path (`pnpm why <package> --recursive`), confirmation of
which workspaces it does/doesn't reach, and the specific reasoning for
why it doesn't pose a real risk in this codebase — not just "no patch
exists yet." An advisory with no clear reachability/impact argument
should not be exempted; leave the check failing and treat it as a real
blocker instead.
