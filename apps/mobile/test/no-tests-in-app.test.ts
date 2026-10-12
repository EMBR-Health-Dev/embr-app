import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Expo Router makes every file under app/ a route, so a test file there
// is bundled into the app together with vitest, and the build fails
// ("Invalid call ... import(filepath)" from vite). Screen tests belong
// in test/screens.
const APP_DIR = join(__dirname, "..", "app");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("app/ directory", () => {
  it("contains no test files", () => {
    const tests = filesUnder(APP_DIR)
      .filter((file) => /\.(test|spec)\.[jt]sx?$/.test(file))
      .map((file) => relative(APP_DIR, file));
    expect(tests).toEqual([]);
  });
});
