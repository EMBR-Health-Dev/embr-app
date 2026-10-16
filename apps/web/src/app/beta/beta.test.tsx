import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/beta",
}));
vi.mock("../../i18n/actions", () => ({ setLocale: vi.fn() }));

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

async function renderPage(locale: "en" | "ja") {
  const { default: BetaGuidePage } = await import("./page");
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ja}>
      <BetaGuidePage />
    </NextIntlClientProvider>,
  );
}

describe("Beta guide page", () => {
  it("welcomes testers and links to sign up and log in", async () => {
    await renderPage("en");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome to the EMBR beta");
    expect(screen.getAllByRole("link", { name: "Log in" })[0]).toHaveAttribute("href", "/login");
    expect(screen.getByRole("heading", { name: "If you can't log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "info@embrhealthcare.com" })).toHaveAttribute(
      "href",
      "mailto:info@embrhealthcare.com",
    );
  });

  it("renders in Japanese", async () => {
    await renderPage("ja");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("EMBRベータ版へようこそ");
  });

  it("has the same keys in English and Japanese", () => {
    expect(keys(ja.Beta).sort()).toEqual(keys(en.Beta).sort());
  });

  it("has no em dashes or hyphens in its English copy", () => {
    const copy = keys(en.Beta).map((k) =>
      k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], en.Beta),
    );
    for (const text of copy as string[]) {
      expect(text.replace(/no-reply@embrhealthcare\.com/g, ""), text).not.toMatch(/[—–]|\w-\w/);
    }
  });
});
