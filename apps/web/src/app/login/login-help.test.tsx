import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import { ApiError } from "../../lib/api-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../lib/auth-context", () => ({ useAuth: () => ({ refresh: vi.fn() }) }));
const loginMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: { auth: { login: (...a: unknown[]) => loginMock(...a) }, sso: { startUrl: () => "" } },
}));

async function renderLogin() {
  const { default: LoginPage } = await import("./page");
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginPage />
    </NextIntlClientProvider>,
  );
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "person@embr.health");
  await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
  await user.click(screen.getByRole("button", { name: /log in/i }));
}

beforeEach(() => loginMock.mockReset());

describe("Login help for beta testers", () => {
  it("says which email to use", async () => {
    await renderLogin();
    expect(screen.getByText("Use the email you signed up with.")).toBeInTheDocument();
  });

  it("lets the password be shown and hidden again", async () => {
    const user = userEvent.setup();
    await renderLogin();
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(field).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("offers a password reset right after a rejected login", async () => {
    loginMock.mockRejectedValueOnce(new ApiError(401, "UNAUTHORIZED", "Invalid email or password"));
    const user = userEvent.setup();
    await renderLogin();
    await submit(user);
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "reset your password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("does not blame the password when the server failed", async () => {
    loginMock.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "Something went wrong"));
    const user = userEvent.setup();
    await renderLogin();
    await submit(user);
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "reset your password" })).toBeNull();
  });
});
