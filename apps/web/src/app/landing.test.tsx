import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import HomePage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

// LanguageSwitcher imports a "use server" action that reaches for
// next/headers — irrelevant to these tests.
vi.mock("../i18n/actions", () => ({ setLocale: vi.fn() }));

let authState: { user: { id: string; email: string } | null; loading: boolean } = {
  user: null,
  loading: false,
};
vi.mock("../lib/auth-context", () => ({
  useAuth: () => authState,
}));

function renderPage(locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ja}
      timeZone="UTC"
      onError={(err) => {
        throw err;
      }}
    >
      <HomePage />
    </NextIntlClientProvider>,
  );
}

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("Public landing page (/)", () => {
  beforeEach(() => {
    authState = { user: null, loading: false };
    replace.mockClear();
  });

  it("renders the hero with a single h1", () => {
    renderPage();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Make sense of what you're experiencing.");
    expect(screen.getByText("Evidence infrastructure for menopause")).toBeInTheDocument();
  });

  it("does not redirect anyone away from /", () => {
    renderPage();
    authState = { user: { id: "u1", email: "person@embr.health" }, loading: false };
    renderPage();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends every 'Start using EMBR' CTA to the existing /register flow", () => {
    renderPage();
    const starts = screen.getAllByRole("link", { name: "Start using EMBR" });
    // header (sm+), hero, closing CTA
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (const link of starts) expect(link).toHaveAttribute("href", "/register");
  });

  it("links the secondary CTAs to in-page sections that exist", () => {
    const { container } = renderPage();
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Explore the product" })).toHaveAttribute(
      "href",
      "#product",
    );
    for (const id of ["how-it-works", "product", "brief", "privacy", "main"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("shows the non-diagnostic trust statement and Brief disclaimer", () => {
    renderPage();
    expect(
      screen.getAllByText(
        "Not a diagnosis. Not medical advice. A clearer record for you and your healthcare conversations.",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "It is a summary of your recorded data, not a diagnosis and not medical advice.",
      ),
    ).toBeInTheDocument();
  });

  it("labels product mockups as illustrative sample data", () => {
    renderPage();
    expect(screen.getAllByText("Illustrative example with sample data")).toHaveLength(2);
  });

  it("offers Log in to signed-out visitors and never links to pages that don't exist", () => {
    const { container } = renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/privacy");
    expect(hrefs).not.toContain("/terms");
  });

  it("gives signed-in visitors a way back to the dashboard", () => {
    authState = { user: { id: "u1", email: "person@embr.health" }, loading: false };
    renderPage();
    expect(screen.getByRole("link", { name: "Open your dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders fully in Japanese with no missing messages", () => {
    renderPage("ja");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "いま起きていることを、理解できる形に。",
    );
    for (const link of screen.getAllByRole("link", { name: "EMBRをはじめる" })) {
      expect(link).toHaveAttribute("href", "/register");
    }
  });

  it("keeps the en and ja Landing messages in sync", () => {
    expect(keyPaths(ja.Landing).sort()).toEqual(keyPaths(en.Landing).sort());
  });
});
