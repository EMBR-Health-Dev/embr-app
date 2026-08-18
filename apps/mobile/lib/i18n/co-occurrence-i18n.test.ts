/* eslint-disable import/no-named-as-default-member -- i18next's default export is the real, documented instance API (init/changeLanguage/t); this plugin's heuristic flags every call because those same names also happen to exist as separate named exports on the module, not because this is actually a mix-up. Same false positive already noted and suppressed in lib/i18n/plurals.test.ts. */
import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";

// Mirrors plurals.test.ts's approach: a standalone i18next instance
// against the real committed locale files, not a mock — this is the
// only way to verify mobile's localization for this feature, since
// @testing-library/react-native isn't available in this project (see
// lib/i18n/locale.test.ts's own note on the same constraint).
beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

describe("coOccurrence.message localization", () => {
  it("English: renders the full sentence with real category translations, singular day", async () => {
    await i18next.changeLanguage("en");
    const message = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.HOT_FLASH"),
      categoryB: i18next.t("enums.category.FATIGUE"),
      count: 1,
    });
    expect(message).toBe("Hot Flash appeared alongside Fatigue on 1 day.");
  });

  it("English: pluralizes correctly for more than one day", async () => {
    await i18next.changeLanguage("en");
    const message = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.SLEEP_DISTURBANCE"),
      categoryB: i18next.t("enums.category.ANXIETY"),
      count: 6,
    });
    expect(message).toBe("Sleep Disturbance appeared alongside Anxiety on 6 days.");
  });

  it("Japanese: renders the full sentence with real category translations, using the single 'other' plural form at any count", async () => {
    await i18next.changeLanguage("ja");
    const singleDay = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.HOT_FLASH"),
      categoryB: i18next.t("enums.category.FATIGUE"),
      count: 1,
    });
    const sixDays = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.HOT_FLASH"),
      categoryB: i18next.t("enums.category.FATIGUE"),
      count: 6,
    });
    expect(singleDay).toBe("ホットフラッシュは倦怠感とともに、1日記録されています。");
    expect(sixDays).toBe("ホットフラッシュは倦怠感とともに、6日記録されています。");
  });

  it("never falls back to a raw category enum value in either locale", async () => {
    await i18next.changeLanguage("en");
    const enMessage = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.BRAIN_FOG"),
      categoryB: i18next.t("enums.category.MOOD_CHANGE"),
      count: 3,
    });
    expect(enMessage).not.toContain("BRAIN_FOG");
    expect(enMessage).not.toContain("MOOD_CHANGE");

    await i18next.changeLanguage("ja");
    const jaMessage = i18next.t("coOccurrence.message", {
      categoryA: i18next.t("enums.category.BRAIN_FOG"),
      categoryB: i18next.t("enums.category.MOOD_CHANGE"),
      count: 3,
    });
    expect(jaMessage).not.toContain("BRAIN_FOG");
    expect(jaMessage).not.toContain("MOOD_CHANGE");
  });

  it("both locales include a non-diagnostic caveat", async () => {
    await i18next.changeLanguage("en");
    expect(i18next.t("coOccurrence.caveat")).toMatch(/not a diagnosis/i);

    await i18next.changeLanguage("ja");
    expect(i18next.t("coOccurrence.caveat")).toContain("診断");
  });
});
