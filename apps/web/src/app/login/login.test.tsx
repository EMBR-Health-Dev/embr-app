import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

const routerPush = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParamsValue,
}));

const refreshMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ refresh: refreshMock }),
}));

const loginMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      login: (...args: unknown[]) => loginMock(...args),
    },
    sso: { startUrl: (email: string) => `/api/auth/sso/start?email=${email}` },
  },
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "person@embr.health");
  await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
  await user.click(screen.getByRole("button", { name: /log in/i }));
}

beforeEach(() => {
  routerPush.mockClear();
  refreshMock.mockClear();
  loginMock.mockReset();
  searchParamsValue = new URLSearchParams();
});

describe("Login — post-login onboarding routing", () => {
  it("routes to /onboarding when the account hasn't completed onboarding", async () => {
    loginMock.mockResolvedValue({
      user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: null },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");

    renderWithIntl(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/onboarding"));
  });

  it("routes to /dashboard when onboarding is already completed", async () => {
    loginMock.mockResolvedValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
      },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");

    renderWithIntl(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });

  it("routes to /dashboard when onboarding was skipped, not just fully completed", async () => {
    // skipped and completed both just set onboardingCompletedAt — from
    // the client's perspective there's only one signal to check.
    loginMock.mockResolvedValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: "2026-01-02T00:00:00Z",
      },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");

    renderWithIntl(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });

  it("an explicit redirect param wins over onboarding routing entirely", async () => {
    searchParamsValue = new URLSearchParams({ redirect: "/organizations/accept-invite?token=abc" });
    loginMock.mockResolvedValue({
      user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: null },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");

    renderWithIntl(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/organizations/accept-invite?token=abc"),
    );
  });
});

describe("Login — translation", () => {
  it("renders English strings by default", async () => {
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByText("Continue with SSO")).toBeInTheDocument();
  });

  it("has a Forgot password? link pointing at /forgot-password", async () => {
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    const link = screen.getByText("Forgot password?");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/forgot-password");
  });

  it("has a link to the public self-assessment at /assessment", async () => {
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    const link = screen.getByText("Not sure yet? Take a quick self-assessment");
    expect(link.closest("a")).toHaveAttribute("href", "/assessment");
  });

  it("renders Japanese strings when the ja locale is active", async () => {
    const { default: LoginPage } = await import("./page");
    render(
      <NextIntlClientProvider locale="ja" messages={ja}>
        <LoginPage />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("おかえりなさい")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeInTheDocument();
    expect(screen.getByText("SSOでログイン")).toBeInTheDocument();
  });

  it("maps a known SSO error code to its translated message", async () => {
    searchParamsValue = new URLSearchParams({ ssoError: "sso_start_failed" });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(
      screen.getByText("Couldn't start SSO sign-in. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("falls back to a generic translated message for an unrecognized SSO error code", async () => {
    searchParamsValue = new URLSearchParams({ ssoError: "something_new_the_ui_never_learned" });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(screen.getByText("SSO sign-in didn't work. Try again.")).toBeInTheDocument();
  });
});
