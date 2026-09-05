/* eslint-disable import/no-named-as-default-member -- same documented i18next false positive noted in co-occurrence-i18n.test.ts and plurals.test.ts. */
import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import en from "../../locales/en.json";
import ja from "../../locales/ja.json";

// Same approach as co-occurrence-i18n.test.ts: a standalone i18next
// instance against the real committed locale files, so a missing or
// mistyped ja.json key shows up as this test failing, not as a user
// silently seeing English (or a raw i18next key) in the Japanese app.
beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en }, ja: { translation: ja } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

const REFLECTION_KEYS = [
  "reflections.dismiss",
  "reflections.loggingActivity.heading",
  "reflections.loggingActivity.message",
  "reflections.loggingActivity.daysPhrase",
  "reflections.symptomFrequency.heading",
  "reflections.symptomFrequency.message",
  "reflections.coOccurrence.heading",
  "reflections.coOccurrence.message",
  "reflections.coOccurrence.caveat",
  "reflections.treatmentContext.heading",
  "reflections.treatmentContext.message",
  "reflections.treatmentContext.caveat",
  "home.yourWeek",
];

describe("reflections locale parity", () => {
  it.each(REFLECTION_KEYS)("%s resolves to a real, distinct string in both locales", (key) => {
    i18next.changeLanguage("en");
    const enValue = i18next.t(key, { count: 1, name: "Estradiol patch" });
    i18next.changeLanguage("ja");
    const jaValue = i18next.t(key, { count: 1, name: "エストラジオール" });

    // A missing key falls back to the key itself (or the fallback
    // locale's string) — neither is a real translation, so both must
    // be excluded explicitly rather than just checking truthiness.
    expect(enValue).not.toBe(key);
    expect(jaValue).not.toBe(key);
    expect(jaValue).not.toBe(enValue);
  });
});

describe("reflections.loggingActivity.message", () => {
  // daysPhrase is composed via its own t() call — the same
  // independent-pluralization pattern reflection-card.tsx itself
  // uses, not passed as a bare number. See reflection-card.tsx's own
  // comment on why: count and days are independently pluralizable
  // (e.g. 3 logs on a single day), and a single t() call's plural
  // selection keys off exactly one interpolated value.
  function loggingActivityMessage(count: number, days: number): string {
    return i18next.t("reflections.loggingActivity.message", {
      count,
      daysPhrase: i18next.t("reflections.loggingActivity.daysPhrase", { count: days }),
    });
  }

  it("English pluralizes count and days independently when they agree", () => {
    i18next.changeLanguage("en");
    expect(loggingActivityMessage(1, 1)).toBe("You've logged 1 time, across 1 day.");
    expect(loggingActivityMessage(5, 3)).toBe("You've logged 5 times, across 3 days.");
  });

  // Regression: before daysPhrase existed, this message interpolated
  // a bare {{days}} number into text whose singular/plural form was
  // selected by `count` alone — so logCount's plural form was silently
  // applied to daysLogged too. Confirmed directly against the actual
  // shipped code before fixing it: `t(message, { count: 3, days: 1 })`
  // produced the literal text "You've logged 3 times, across 1 days."
  // This is a real, reachable case, not a contrived one: it's exactly
  // what MIN_REFLECTION_LOGS's floor of 3 combined with a user logging
  // several symptoms on a single day produces.
  it("English pluralizes count and days independently when they disagree — the reachable case reflection-engine.ts's own MIN_REFLECTION_LOGS floor produces", () => {
    i18next.changeLanguage("en");
    // 3+ logs (the minimum to ever surface this reflection at all),
    // all on the same single day.
    expect(loggingActivityMessage(3, 1)).toBe("You've logged 3 times, across 1 day.");
    // The inverse: few enough distinct days to read as singular, but
    // more individual logs than days (e.g. 2 logs on day one, 1 on
    // day two would be count=3, days=2 — still plural "days").
    expect(loggingActivityMessage(4, 2)).toBe("You've logged 4 times, across 2 days.");
  });

  it("Japanese uses the single 'other' plural form at any count, for both count and days", () => {
    i18next.changeLanguage("ja");
    expect(loggingActivityMessage(1, 1)).toBe("1日間で、1回記録しました。");
    expect(loggingActivityMessage(5, 3)).toBe("3日間で、5回記録しました。");
    expect(loggingActivityMessage(3, 1)).toBe("1日間で、3回記録しました。");
  });
});

describe("reflections.treatmentContext", () => {
  it("interpolates the treatment name into the heading in both locales", () => {
    i18next.changeLanguage("en");
    expect(i18next.t("reflections.treatmentContext.heading", { name: "Estradiol patch" })).toBe(
      "Since starting Estradiol patch",
    );

    i18next.changeLanguage("ja");
    expect(i18next.t("reflections.treatmentContext.heading", { name: "エストラジオール" })).toBe(
      "エストラジオールを始めてから",
    );
  });

  it("never phrases the caveat as an affirmative efficacy claim, in either locale", () => {
    i18next.changeLanguage("en");
    const en_ = i18next.t("reflections.treatmentContext.caveat");
    // The real risk is an affirmative claim like "it's working" or
    // "it's improving your symptoms" — a *negated* disclaimer that
    // happens to contain "working" (e.g. "not a measure of how well
    // it's working") is exactly the safe pattern this copy should use,
    // so assert on the affirmative phrasing specifically, not the bare
    // word.
    expect(en_).not.toMatch(/is working|is improving|is effective/i);
    expect(en_).toMatch(/not a measure/i);

    i18next.changeLanguage("ja");
    const ja_ = i18next.t("reflections.treatmentContext.caveat");
    expect(ja_).not.toContain("効果があります");
    expect(ja_).not.toContain("改善しています");
  });
});

describe("reflections.coOccurrence.caveat", () => {
  it("both locales explicitly disclaim a medical conclusion", () => {
    i18next.changeLanguage("en");
    expect(i18next.t("reflections.coOccurrence.caveat")).toMatch(/not a medical conclusion/i);

    i18next.changeLanguage("ja");
    expect(i18next.t("reflections.coOccurrence.caveat")).toContain("医学的な結論ではありません");
  });
});
