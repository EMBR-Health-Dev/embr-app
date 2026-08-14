import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

describe("Organization — ICU plural messages", () => {
  it("English: singular vs plural member count render distinctly", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "Organization" });
    expect(t("memberCount", { count: 1 })).toBe("1 member");
    expect(t("memberCount", { count: 5 })).toBe("5 members");
  });

  it("Japanese: the plural message renders correctly for any count (no grammatical plural, single 'other' form)", () => {
    const t = createTranslator({ locale: "ja", messages: ja, namespace: "Organization" });
    expect(t("memberCount", { count: 1 })).toBe("メンバー 1人");
    expect(t("memberCount", { count: 5 })).toBe("メンバー 5人");
  });

  it("basedOnCohort pluralizes correctly in English", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "Organization" });
    expect(t("basedOnCohort", { count: 1 })).toBe(
      "Based on 1 member who logged something in this window.",
    );
    expect(t("basedOnCohort", { count: 3 })).toBe(
      "Based on 3 members who logged something in this window.",
    );
  });
});
