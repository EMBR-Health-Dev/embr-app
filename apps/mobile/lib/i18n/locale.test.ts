import { describe, expect, it, vi, beforeEach } from "vitest";
import { isLocale, getStoredLocale, setStoredLocale } from "./locale";
import { deviceLocale } from "./index";

const { mockGetItemAsync, mockSetItemAsync } = vi.hoisted(() => ({
  mockGetItemAsync: vi.fn(),
  mockSetItemAsync: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
}));

const { mockGetLocales } = vi.hoisted(() => ({ mockGetLocales: vi.fn() }));
vi.mock("expo-localization", () => ({ getLocales: mockGetLocales }));

beforeEach(() => {
  mockGetItemAsync.mockReset();
  mockSetItemAsync.mockReset();
  mockGetLocales.mockReset();
});

describe("isLocale", () => {
  it("accepts en and ja", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ja")).toBe(true);
  });

  it("rejects unsupported languages, null, and undefined", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("getStoredLocale", () => {
  it("returns null when nothing has ever been stored", async () => {
    mockGetItemAsync.mockResolvedValue(null);
    expect(await getStoredLocale()).toBeNull();
  });

  it("returns the stored locale when it's a supported value", async () => {
    mockGetItemAsync.mockResolvedValue("ja");
    expect(await getStoredLocale()).toBe("ja");
  });

  it("returns null for a corrupted/unsupported stored value rather than trusting it blindly", async () => {
    mockGetItemAsync.mockResolvedValue("something-invalid");
    expect(await getStoredLocale()).toBeNull();
  });
});

describe("setStoredLocale", () => {
  it("writes the locale to SecureStore under the expected key", async () => {
    await setStoredLocale("ja");
    expect(mockSetItemAsync).toHaveBeenCalledWith("embr_locale", "ja");
  });
});

describe("deviceLocale", () => {
  it("uses the device's most-preferred language when it's supported", () => {
    mockGetLocales.mockReturnValue([{ languageCode: "ja" }, { languageCode: "en" }]);
    expect(deviceLocale()).toBe("ja");
  });

  it("falls back to the default when the device's language isn't supported", () => {
    mockGetLocales.mockReturnValue([{ languageCode: "fr" }]);
    expect(deviceLocale()).toBe("en");
  });

  it("falls back to the default when languageCode is missing entirely", () => {
    mockGetLocales.mockReturnValue([{ languageCode: null }]);
    expect(deviceLocale()).toBe("en");
  });
});
