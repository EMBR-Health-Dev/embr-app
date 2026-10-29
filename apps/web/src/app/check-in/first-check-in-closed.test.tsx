import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/check-in",
}));
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh: vi.fn(), logout: vi.fn() }),
}));
const saveMock = vi.fn();
vi.mock("../../lib/api", () => ({ api: { baselineCheckIns: { save: saveMock } } }));

describe("First check in while sign up is closed", () => {
  it("offers early access, which sends nothing, instead of sign up", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "false";
    vi.stubGlobal("scrollTo", vi.fn());
    const { FirstCheckIn } = await import("./first-check-in");
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FirstCheckIn />
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Not sure yet" }));
    await user.click(screen.getByRole("button", { name: "Fatigue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Skip and see my result" }));

    const link = screen.getByRole("link", { name: "Request early access" });
    expect(link).toHaveAttribute(
      "href",
      "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access",
    );
    expect(link.getAttribute("href")).not.toMatch(/fatigue/i);
    expect(screen.queryByRole("link", { name: "Save and keep tracking" })).not.toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "true";
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });
});
