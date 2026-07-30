import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      exclude: ["**/*.d.ts", "src/server.ts"],
      // Deliberately conservative starting point — this was added without
      // a live Postgres/Redis available to actually run the suite and
      // read the real number back (see Milestone 11 in
      // docs/MILESTONES.md). The first real CI run after this lands will
      // report actual coverage; raise these to match it immediately so
      // the threshold does its real job (catching regressions), rather
      // than leaving a low number that lets coverage quietly drop.
      // Never lower these numbers to make CI pass.
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
});
