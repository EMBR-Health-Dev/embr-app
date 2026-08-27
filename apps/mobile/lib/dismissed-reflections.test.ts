import { describe, expect, it, vi, beforeEach } from "vitest";
import { dismissReflection, filterDismissed, isReflectionDismissed } from "./dismissed-reflections";

const { mockGetItemAsync, mockSetItemAsync } = vi.hoisted(() => ({
  mockGetItemAsync: vi.fn(),
  mockSetItemAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
}));

beforeEach(() => {
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockSetItemAsync.mockReset().mockResolvedValue(undefined);
});

describe("isReflectionDismissed", () => {
  it("is false when nothing has been stored yet", async () => {
    expect(await isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(false);
  });

  it("is true for an id present in the stored set", async () => {
    mockGetItemAsync.mockResolvedValue(JSON.stringify(["weekly_frequency:2026-01-01"]));
    expect(await isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(true);
    expect(await isReflectionDismissed("logging_streak:2026-01-01")).toBe(false);
  });

  it("treats corrupted stored JSON as no dismissals, rather than throwing", async () => {
    mockGetItemAsync.mockResolvedValue("{not valid json");
    expect(await isReflectionDismissed("weekly_frequency:2026-01-01")).toBe(false);
  });
});

describe("dismissReflection", () => {
  it("writes the id into the stored set, alongside any already present", async () => {
    mockGetItemAsync.mockResolvedValue(JSON.stringify(["logging_streak:2026-01-01"]));

    await dismissReflection("weekly_frequency:2026-01-01");

    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "embr_dismissed_reflection_ids",
      expect.stringContaining("weekly_frequency:2026-01-01"),
    );
    const written = JSON.parse(mockSetItemAsync.mock.calls[0]![1] as string);
    expect(new Set(written)).toEqual(
      new Set(["logging_streak:2026-01-01", "weekly_frequency:2026-01-01"]),
    );
  });
});

describe("filterDismissed", () => {
  it("removes only the dismissed reflection, keeping others", async () => {
    mockGetItemAsync.mockResolvedValue(JSON.stringify(["logging_streak:2026-01-01"]));
    const reflections = [
      { id: "weekly_frequency:2026-01-01", type: "weekly_frequency" as const },
      { id: "logging_streak:2026-01-01", type: "logging_streak" as const },
    ];

    const result = await filterDismissed(reflections);

    expect(result).toEqual([{ id: "weekly_frequency:2026-01-01", type: "weekly_frequency" }]);
  });

  it("returns the full list unchanged when nothing is dismissed", async () => {
    const reflections = [{ id: "weekly_frequency:2026-01-01", type: "weekly_frequency" as const }];
    expect(await filterDismissed(reflections)).toEqual(reflections);
  });
});
