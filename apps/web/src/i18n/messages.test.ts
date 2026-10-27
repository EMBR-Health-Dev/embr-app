import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { LOCALES } from "./locale";

// The MRS check in stays English only until the licence for other
// languages is confirmed (see lib/mrs.ts), so it has no French copy.
const ENGLISH_ONLY_NAMESPACES = ["MrsCheckIn"];

function keyPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

function strings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node !== "object" || node === null) return [];
  return Object.values(node).flatMap(strings);
}

describe("French messages", () => {
  it("is a supported locale", () => {
    expect(LOCALES).toContain("fr");
  });

  it("has every English key outside the English only namespaces, and no extra keys", () => {
    const expected = keyPaths(en).filter(
      (k) => !ENGLISH_ONLY_NAMESPACES.some((ns) => k.startsWith(`${ns}.`)),
    );
    expect(keyPaths(fr).sort()).toEqual(expected.sort());
  });

  it("keeps every interpolation placeholder from the English source", () => {
    const enMap = new Map(keyPaths(en).map((k) => [k, k]));
    const lookup = (root: unknown, path: string) =>
      path.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], root);
    // Top level arguments only: `{name}` or `{name, plural, ...}`, plus rich text tags.
    const args = (s: string) => {
      const found = new Set<string>();
      let depth = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === "{") {
          if (depth === 0) found.add(s.slice(i + 1).match(/^\s*(\w+)/)?.[1] ?? "");
          depth++;
        } else if (s[i] === "}") depth--;
      }
      for (const m of s.matchAll(/<(\w+)>/g)) found.add(`<${m[1]}>`);
      return [...found].sort();
    };
    for (const path of keyPaths(fr)) {
      if (!enMap.has(path)) continue;
      expect(args(lookup(fr, path) as string), path).toEqual(args(lookup(en, path) as string));
    }
  });

  it("never uses dash punctuation or a bare ASCII apostrophe", () => {
    for (const s of strings(fr)) {
      expect(s).not.toMatch(/[–—]/);
      // An ASCII apostrophe starts an ICU quoted section, so French copy
      // uses the typographic one throughout.
      expect(s).not.toContain("'");
    }
  });
});
