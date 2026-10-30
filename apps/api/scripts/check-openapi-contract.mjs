/**
 * OpenAPI contract floor check.
 *
 * Protects against a truncated or broken docs/openapi.yaml landing on main.
 * Scope is intentionally small (PR B):
 *   - YAML parses
 *   - openapi field is 3.1.x
 *   - at least MIN_PATHS distinct path entries (known-good restore baseline)
 *   - every local #/ $ref resolves inside the document
 *
 * Does NOT assert completeness against Express routes. That is PR C / later.
 * Critical-path assertions are deferred until those operations are documented.
 *
 * Run from repo root:
 *   pnpm --filter @embr/api exec node scripts/check-openapi-contract.mjs
 *
 * yaml is a dependency of @embr/api, so this script lives under apps/api/scripts.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

/** Known-good path count after restoring from ee3b0c1 / PR #304. Floor, not target. */
const MIN_PATHS = 47;
const MIN_BYTES = 10_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/scripts → repo root docs/openapi.yaml
const openapiPath = join(__dirname, "..", "..", "..", "docs", "openapi.yaml");

function fail(message) {
  console.error(`OpenAPI contract check failed: ${message}`);
  process.exit(1);
}

function collectLocalRefs(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "string") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectLocalRefs(item, out);
    return out;
  }
  if (typeof value === "object") {
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
      out.push(value.$ref);
    }
    for (const v of Object.values(value)) collectLocalRefs(v, out);
  }
  return out;
}

function resolveLocalRef(doc, ref) {
  // ref is "#/components/schemas/Foo" → ["components", "schemas", "Foo"]
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = doc;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object" || !(part in cur)) {
      return undefined;
    }
    cur = cur[part];
  }
  return cur;
}

let raw;
try {
  raw = readFileSync(openapiPath, "utf8");
} catch (err) {
  fail(`cannot read ${openapiPath}: ${err.message}`);
}

const byteLength = Buffer.byteLength(raw, "utf8");
if (byteLength < MIN_BYTES) {
  fail(
    `docs/openapi.yaml is only ${byteLength} bytes — likely truncated (expected a full multi-path contract, known-good ~49 KB)`,
  );
}

let doc;
try {
  doc = YAML.parse(raw);
} catch (err) {
  fail(`YAML parse error: ${err.message}`);
}

if (!doc || typeof doc !== "object") {
  fail("parsed document is empty or not an object");
}

const version = String(doc.openapi ?? "");
if (!/^3\.1\.\d+$/.test(version)) {
  fail(`expected openapi 3.1.x (e.g. 3.1.0), got ${JSON.stringify(doc.openapi)}`);
}

const paths = doc.paths && typeof doc.paths === "object" ? Object.keys(doc.paths) : [];
if (paths.length < MIN_PATHS) {
  fail(
    `only ${paths.length} path(s) documented; minimum is ${MIN_PATHS} (known-good restore floor). ` +
      `If the API grew, raise MIN_PATHS deliberately — do not lower it to silence a truncation.`,
  );
}

const refs = collectLocalRefs(doc);
const missing = [];
for (const ref of refs) {
  if (resolveLocalRef(doc, ref) === undefined) {
    missing.push(ref);
  }
}
if (missing.length > 0) {
  const sample = [...new Set(missing)].slice(0, 10).join(", ");
  fail(`${missing.length} unresolved local $ref(s), e.g. ${sample}`);
}

console.log(
  `OpenAPI contract OK: openapi=${version}, paths=${paths.length} (min ${MIN_PATHS}), bytes=${byteLength}, local $refs=${refs.length} resolved`,
);
