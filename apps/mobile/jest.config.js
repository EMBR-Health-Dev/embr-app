/**
 * UI/component tests only — the existing 47 unit tests in lib/**\/*.test.ts
 * stay on Vitest (see vitest.config.ts) unchanged. testMatch requires a
 * .test.tsx extension specifically, which structurally cannot match
 * any of Vitest's .test.ts files, so the two runners never contend
 * for the same file regardless of which directory a test lives in.
 */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/**/*.test.tsx"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/", "/dist/"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Jest's 5000ms default is too tight for RN component tests under
  // jest-expo: a single test can involve several sequential, awaited
  // fireEvent calls (each wrapped in React's act(), which flushes a
  // full re-render), and the first test in any given file also
  // absorbs one-time module/transform initialization cost. Confirmed
  // as real variance, not a one-off: the same local test that ran in
  // 559ms one run took 3613ms in an earlier run in this same
  // environment, and CI (typically slower/noisier than a dev machine)
  // timed out on it at the 5000ms default. 15s gives comfortable
  // headroom above the slowest run observed so far without masking a
  // genuinely hung test.
  testTimeout: 15000,
};
