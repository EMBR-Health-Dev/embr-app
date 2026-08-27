import { cleanup } from "@testing-library/react-native";

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

// jest-expo's preset doesn't auto-register RNTL's cleanup the way
// jest-expo + @testing-library/react-native's own docs assume a
// consuming project will — demonstrated directly: a multi-test file
// (test/login.test.tsx) failed on every test after the first with
// "overlapping act() calls" and "Unable to find an element", because
// each test's render tree was still mounted when the next began.
// cleanup() itself is async (unmounts via the same act()-wrapped path
// as render()), so afterEach must await it — an unawaited afterEach
// let the next test's render() start before the previous tree was
// actually torn down, which was the exact cause of both symptoms.
afterEach(async () => {
  await cleanup();
});
