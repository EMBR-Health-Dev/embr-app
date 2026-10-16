import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import { ApiError } from "../../lib/api-client";

const routerPush = vi.fn();
let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParamsValue,
}));
const refreshMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/auth-context", () => ({ useAuth: () => ({ refresh: refreshMock }) }));
const requestMock = vi.fn();
const consumeMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      requestLoginLink: (...a: unknown[]) => requestMock(...a),
      consumeLoginLink: (...a: unknown[]) => consumeMock(...a),
    },
  },
}));

async function renderPage() {
  const { default: LoginLinkPage } = await import("./page");
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginLinkPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  routerPush.mockClear();
  refreshMock.mockClear();
  requestMock.mockReset();
  consumeMock.mockReset();
  searchParamsValue = new URLSearchParams();
});

describe("Sign in with an email link", () => {
  it("sends a link and shows the same answer whatever the account", async () => {
    requestMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByLabelText("Email"), "person@embr.health");
    await user.click(screen.getByRole("button", { name: "Send sign in link" }));
    expect(requestMock).toHaveBeenCalledWith("person@embr.health");
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("does not use the link until the person clicks, then signs in", async () => {
    searchParamsValue = new URLSearchParams("token=abc");
    consumeMock.mockResolvedValue({
      user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: "2026-10-01" },
      accessToken: "at",
      refreshToken: "rt",
    });
    const user = userEvent.setup();
    await renderPage();
    expect(consumeMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(consumeMock).toHaveBeenCalledWith("abc");
    expect(refreshMock).toHaveBeenCalled();
    expect(routerPush).toHaveBeenCalledWith("/dashboard");
  });

  it("offers a new link when this one has expired", async () => {
    searchParamsValue = new URLSearchParams("token=old");
    consumeMock.mockRejectedValueOnce(new ApiError(401, "UNAUTHORIZED", "expired"));
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      await screen.findByText("This link has expired or has already been used."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send me a new link" })).toHaveAttribute(
      "href",
      "/login-link",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
