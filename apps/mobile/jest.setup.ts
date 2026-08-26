// @sentry/react-native transitively imports @sentry/core, which ships
// pure ESM (`export { ... } from ...`) that Jest's default
// transformIgnorePatterns doesn't transform, causing a hard
// SyntaxError on any import of the real package — demonstrated by
// running apps/mobile/lib/sentry.ts through the harness directly.
// Mocked to exactly the two calls lib/sentry.ts actually makes; add
// to this list only when a real test demonstrates another export is
// needed (e.g. Sentry.wrap, once a test renders the root _layout.tsx).
jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));
