import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ token: "invite-token-1" }),
}));
// Signed out: the invite can't be redeemed until the person has an account.
vi.mock("../../../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn() }),
}));
vi.mock("../../../lib/api", () => ({ api: { organizations: {} } }));

const EARLY_ACCESS = "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access";

async function renderInvite(open: boolean) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_REGISTRATION_OPEN = open ? "true" : "false";
  const { default: AcceptInvitePage } = await import("./page");
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AcceptInvitePage />
    </NextIntlClientProvider>,
  );
}

describe("Accept-invite page and the registration state", () => {
  it("while sign up is closed, offers early access instead of a new account, and keeps Log in", async () => {
    await renderInvite(false);

    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request early access" })).toHaveAttribute(
      "href",
      EARLY_ACCESS,
    );
    expect(screen.queryByRole("button", { name: "Create an account" })).toBeNull();
    expect(screen.getByText(/new accounts are by request/)).toBeInTheDocument();
    process.env.NEXT_PUBLIC_REGISTRATION_OPEN = "true";
  });

  it("while sign up is open, still offers to create an account", async () => {
    await renderInvite(true);

    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request early access" })).toBeNull();
  });
});
