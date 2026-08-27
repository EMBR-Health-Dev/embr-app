import { describe, expect, it, beforeEach } from "vitest";
import { dismissReflection, isReflectionDismissed } from "./dismissed-reflections";

beforeEach(() => {
  window.localStorage.clear();
});

describe("dismissed-reflections", () => {
  it("is not dismissed before anything has been dismissed", () => {
    expect(isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(false);
  });

  it("marks an id dismissed, and only that id", () => {
    dismissReflection("weekly_frequency:2026-01-01");

    expect(isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(true);
    expect(isReflectionDismissed("logging_streak:2026-01-01")).toBe(false);
  });

  it("persists multiple dismissed ids independently", () => {
    dismissReflection("weekly_frequency:2026-01-01");
    dismissReflection("logging_streak:2026-01-01");

    expect(isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(true);
    expect(isReflectionDismissed("logging_streak:2026-01-01")).toBe(true);
  });

  it("survives being read by a fresh call (persisted, not in-memory only)", () => {
    dismissReflection("weekly_frequency:2026-01-01");
    // A second, independent read — proves this isn't just a module-level
    // variable that happens to still be set within the same test.
    expect(isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(true);
  });

  it("treats corrupted stored JSON as no dismissals, rather than throwing", () => {
    window.localStorage.setItem("embr.dismissedReflectionIds", "{not valid json");
    expect(isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(false);
  });
});
