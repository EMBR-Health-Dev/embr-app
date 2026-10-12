import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// VoiceOver and TalkBack announce a Pressable as a button, link or
// option only when it says which it is. Without accessibilityRole a
// screen reader reads the label alone, and the person cannot tell it
// can be tapped.
const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** The opening tag of each <Pressable ...>, braces balanced. */
function pressableTags(source: string): { line: number; tag: string }[] {
  const tags: { line: number; tag: string }[] = [];
  for (const match of source.matchAll(/<Pressable\b/g)) {
    let i = match.index! + match[0].length;
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0 && source[i - 1] !== "=") break;
      i += 1;
    }
    tags.push({
      line: source.slice(0, match.index).split("\n").length,
      tag: source.slice(match.index, i + 1),
    });
  }
  return tags;
}

describe("Pressable accessibility roles", () => {
  it("gives every Pressable in app/ and components/ an accessibilityRole", () => {
    const missing = [
      ...sourceFiles(join(ROOT, "app")),
      ...sourceFiles(join(ROOT, "components")),
    ].flatMap((file) =>
      pressableTags(readFileSync(file, "utf8"))
        .filter(({ tag }) => !tag.includes("accessibilityRole"))
        .map(({ line }) => `${relative(ROOT, file)}:${line}`),
    );
    expect(missing).toEqual([]);
  });
});
