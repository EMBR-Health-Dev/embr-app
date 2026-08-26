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
  setupFiles: ["<rootDir>/jest.setup.ts"],
};
