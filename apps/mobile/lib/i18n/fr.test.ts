/* eslint-disable import/no-named-as-default-member -- same i18next false positive as plurals.test.ts. */
import { describe, expect, it, beforeAll } from "vitest";
import i18next from "i18next";
import en from "../../locales/en.json";
import fr from "../../locales/fr.json";

function keyPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

function strings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node !== "object" || node === null) return [];
  return Object.values(node).flatMap(strings);
}

beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en }, fr: { translation: fr } },
    lng: "fr",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

describe("French locale file", () => {
  it("has exactly the English keys", () => {
    expect(keyPaths(fr).sort()).toEqual(keyPaths(en).sort());
  });

  it("never uses dash punctuation", () => {
    for (const s of strings(fr)) expect(s).not.toMatch(/[–—]/);
  });

  it("resolves French plurals, with 0 and 1 both singular", () => {
    expect(i18next.t("brief.occurrenceCount", { count: 0 })).toBe("0 occurrence");
    expect(i18next.t("brief.occurrenceCount", { count: 1 })).toBe("1 occurrence");
    expect(i18next.t("brief.occurrenceCount", { count: 5 })).toBe("5 occurrences");
    expect(i18next.t("brief.averageCycleLength", { days: 28, count: 3 })).toBe(
      "Durée moyenne du cycle : 28 jours (3 cycles notés)",
    );
  });

  it("uses localized category labels", () => {
    expect(i18next.t("enums.category.HOT_FLASH")).toBe("Bouffée de chaleur");
    expect(i18next.t("enums.treatmentCategory.HRT")).toBe(
      "THM (traitement hormonal de la ménopause)",
    );
  });
});
