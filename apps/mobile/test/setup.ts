import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

// Metro/Expo's runtime injects this global automatically; nothing in
// a plain Vite/jsdom test environment does. Expo's own Jest preset
// defines this exact global for the same reason — not something
// invented for this repo specifically. react-native's own type
// definitions declare `__DEV__` as a read-only const, so it can't be
// assigned through that typing — going through `globalThis` with a
// narrow, local type instead, rather than reaching for `any`.
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;

/**
 * Native-module mocks shared by every screen test, not per-file — the
 * three things a plain React-Native-web + jsdom pipeline can't import
 * as-is, verified directly (not guessed) by isolating each import one
 * at a time before writing these:
 *
 * - react-native-safe-area-context: its own source still hits the
 *   same Flow-syntax parse failure react-native's core does even
 *   after the react-native -> react-native-web alias (it must import
 *   raw react-native internally via a path the alias doesn't catch).
 * - @react-native-community/datetimepicker: a genuine native module
 *   with Flow-typed source (`import type {BaseProps} from
 *   "./types.js"` resolves to a real .js file containing Flow type
 *   syntax, not a .d.ts) — there is no web-compatible version to
 *   alias to, unlike core react-native itself.
 * - @expo/vector-icons: fails to resolve one of its internal files
 *   under Vite's module resolution (a real, separate problem from the
 *   Flow-syntax ones above).
 *
 * None of apps/mobile's planned screen tests need to actually drive a
 * date picker or inspect real safe-area insets or icon glyphs — these
 * are trivial stand-ins, not full-fidelity reimplementations.
 */
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({
    children,
    style,
  }: {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }) => React.createElement(View, { style }, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: () => null,
}));
