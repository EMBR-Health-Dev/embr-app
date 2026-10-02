import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../lib/api", () => ({ api: { auth: { register: vi.fn() } } }));

describe("Register page while sign up is closed", () => {
  it("shows early access instead of a form that would collect health data", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "false";
    const { default: RegisterPage } = await import("./page");
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <RegisterPage />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "EMBR is in private early access" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request early access" })).toHaveAttribute(
      "href",
      "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "true";
  });
});
