import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../i18n/actions", () => ({ setLocale: vi.fn() }));
vi.mock("../lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));

const EARLY_ACCESS = "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access";

describe("Landing page while sign up is closed", () => {
  it("asks for early access everywhere it would offer an account, and keeps Log in", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "false";
    const { default: HomePage } = await import("./page");
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <HomePage />
      </NextIntlClientProvider>,
    );

    const requests = screen.getAllByRole("link", { name: "Request early access" });
    // Header, hero, closing call to action and footer.
    expect(requests).toHaveLength(4);
    for (const link of requests) expect(link).toHaveAttribute("href", EARLY_ACCESS);
    expect(
      screen.getAllByText("EMBR is currently onboarding a limited group of early users."),
    ).toHaveLength(2);

    expect(screen.queryByRole("link", { name: /Start using EMBR|Create an account/ })).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).not.toContain("/register");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");

    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "true";
  });
});
