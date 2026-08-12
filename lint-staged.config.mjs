import { existsSync } from "node:fs";
import path from "node:path";

/**
 * ESLint's flat-config discovery resolves against the *current working
 * directory* for the whole invocation, not per-file — so a plain
 * `eslint --fix <files>` run from the repo root (as lint-staged did
 * before this file existed) always used the bare root eslint.config.js
 * for every file, even ones inside apps/web, apps/admin, or
 * apps/mobile, silently ignoring those apps' own richer configs
 * (Next/Expo plugins, stricter react-hooks rules, etc.) — see the
 * "Milestone 16" entry in docs/MILESTONES.md for how this was found:
 * a disable-comment for an app-specific-only rule broke the pre-commit
 * hook the moment one was ever added, revealing this had been silently
 * true all along.
 *
 * Fix: group staged files by their nearest package directory (the
 * first two path segments under apps/ or packages/) and pass each
 * group to eslint with an explicit --config pointing at that package's
 * own eslint.config.mjs when it has one (falling back to root's
 * default resolution otherwise, which is correct for the packages that
 * don't need anything richer).
 */
function groupByPackageDir(files) {
  const groups = new Map();

  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const segments = relative.split(path.sep);
    const packageDir =
      (segments[0] === "apps" || segments[0] === "packages") && segments[1]
        ? path.join(segments[0], segments[1])
        : "."; // root-level files (e.g. this config file itself)

    if (!groups.has(packageDir)) groups.set(packageDir, []);
    groups.get(packageDir).push(relative);
  }

  return groups;
}

export default {
  "*.{ts,tsx}": (files) => {
    const groups = groupByPackageDir(files);
    return [...groups.entries()].map(([dir, relativeFiles]) => {
      const configPath = path.join(dir, "eslint.config.mjs");
      const configArg = existsSync(configPath) ? `--config ${JSON.stringify(configPath)}` : "";
      return `pnpm exec eslint --fix ${configArg} ${relativeFiles.map((f) => JSON.stringify(f)).join(" ")}`;
    });
  },
  "*.{ts,tsx,md,json,yml,yaml}": ["prettier --write"],
};
