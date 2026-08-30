import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // react-native's own source uses Flow type syntax
    // (`import typeof * as X from "...flow"`), which Vite's esbuild-
    // based transform cannot parse at all — confirmed directly by
    // running a test against it, not assumed. react-native-web is
    // already a project dependency (used for Expo's web target),
    // implements the same core primitives (View, Text, FlatList,
    // Pressable, ...) in plain modern JS/TS with no Flow syntax, and
    // is the standard way to run RN component code through a
    // web-style bundler/test pipeline without Metro. Screens using
    // native-only modules (date pickers, native sharing, etc.) still
    // need those specific modules mocked — this alias only solves
    // "can Vite parse react-native's core primitives at all."
    alias: { "react-native$": "react-native-web" },
  },
  test: {
    environment: "node",
    globals: false,
    // lib/**/*.test.ts: pure logic, unchanged, no DOM needed.
    // app/**/*.test.tsx: screen component tests, which render through
    // react-native-web (see the alias above) and therefore need a
    // DOM. Vitest 4 dropped `environmentMatchGlobs` (tried it first;
    // confirmed it's a silent no-op on this version rather than
    // assuming), so each such test file opts into jsdom itself via a
    // `// @vitest-environment jsdom` docblock at the top of the file
    // instead — lib tests keep the faster, simpler node default this
    // way, with no environment declared per-file for them.
    include: ["lib/**/*.test.ts", "app/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
    // Vitest's own test-transform pipeline resolves modules
    // separately from top-level Vite `resolve.alias` in some cases
    // (observed directly: the bare "react-native" import still hit
    // react-native's real, Flow-typed source with only the top-level
    // alias set) — `test.alias` is Vitest's own alias list, applied
    // in its test-file resolution specifically.
    alias: { "react-native": "react-native-web" },
  },
});
