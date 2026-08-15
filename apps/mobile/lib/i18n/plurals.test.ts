/* eslint-disable import/no-named-as-default-member -- i18next's default export is the real, documented instance API (init/changeLanguage/t); this plugin's heuristic flags every call because those same names also happen to exist as separate named exports on the module, not because this is actually a mix-up. Same false positive already noted and suppressed once in lib/i18n/index.ts's i18n.use() call — file-scoped here since nearly every line in this file hits it. */
import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";

// A standalone instance, not app/_layout.tsx's shared initI18n() — that
// one resolves the device/stored locale asynchronously via native
// modules this test environment doesn't have. This just proves the
// actual committed locale files' plural keys resolve correctly through
// real i18next, the same library and JSON format the app itself uses.
beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

describe("brief.occurrenceCount plural resolution", () => {
  it("English: singular vs plural forms render distinctly", async () => {
    await i18next.changeLanguage("en");
    expect(i18next.t("brief.occurrenceCount", { count: 1 })).toBe("1 occurrence");
    expect(i18next.t("brief.occurrenceCount", { count: 5 })).toBe("5 occurrences");
  });

  it("Japanese: the single 'other' form renders correctly at any count", async () => {
    await i18next.changeLanguage("ja");
    expect(i18next.t("brief.occurrenceCount", { count: 1 })).toBe("1回");
    expect(i18next.t("brief.occurrenceCount", { count: 5 })).toBe("5回");
  });
});

describe("brief.averageCycleLength plural resolution", () => {
  it("English: singular vs plural cycle count", async () => {
    await i18next.changeLanguage("en");
    expect(i18next.t("brief.averageCycleLength", { days: 28, count: 1 })).toBe(
      "Average cycle length: 28 days (1 cycle recorded)",
    );
    expect(i18next.t("brief.averageCycleLength", { days: 28, count: 3 })).toBe(
      "Average cycle length: 28 days (3 cycles recorded)",
    );
  });

  it("Japanese: the single 'other' form renders correctly at any count", async () => {
    await i18next.changeLanguage("ja");
    expect(i18next.t("brief.averageCycleLength", { days: 28, count: 3 })).toBe(
      "平均周期: 28日(3周期記録あり)",
    );
  });
});
