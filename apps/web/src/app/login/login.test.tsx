import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { ApiError } from "../../lib/api-client";

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
const completeMfaMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      login: (...args: unknown[]) => loginMock(...args),
      completeMfa: (...args: unknown[]) => completeMfaMock(...args),
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
  completeMfaMock.mockReset();
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

  it("confirms the deletion when reason=account-deleted", async () => {
    searchParamsValue = new URLSearchParams({ reason: "account-deleted" });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(
      screen.getByText("Your account and everything in it have been deleted."),
    ).toBeInTheDocument();
  });

  it("shows the session-expired message when reason=session-expired", async () => {
    searchParamsValue = new URLSearchParams({ reason: "session-expired" });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(screen.getByText("Your session expired. Log in again to continue.")).toBeInTheDocument();
  });

  it("does not show the session-expired message for an ordinary visit with no reason param", async () => {
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);

    expect(
      screen.queryByText("Your session expired. Log in again to continue."),
    ).not.toBeInTheDocument();
  });
});

describe("Login — consent routing", () => {
  const pending = { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "MISSING" };

  it("goes to the consent screen first, carrying the normal destination", async () => {
    loginMock.mockResolvedValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
        consents: pending,
      },
    });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/consent?redirect=%2Fdashboard"));
  });

  it("puts consent ahead of an explicit redirect too", async () => {
    searchParamsValue = new URLSearchParams({ redirect: "/organizations/accept-invite?token=x" });
    loginMock.mockResolvedValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: null,
        consents: pending,
      },
    });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(
        `/consent?redirect=${encodeURIComponent("/organizations/accept-invite?token=x")}`,
      ),
    );
  });

  it("goes straight to the destination when everything is current", async () => {
    loginMock.mockResolvedValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
        consents: { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "CURRENT" },
      },
    });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);
    await fillAndSubmit();
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });
});

describe("Login — two-step sign in", () => {
  const session = {
    user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: "2026-10-01" },
    accessToken: "at",
    refreshToken: "rt",
  };

  async function reachCodeStep() {
    loginMock.mockResolvedValue({ mfaRequired: true, mfaToken: "challenge-token" });
    const { default: LoginPage } = await import("./page");
    renderWithIntl(<LoginPage />);
    await fillAndSubmit();
    expect(await screen.findByRole("heading", { name: "Enter your code" })).toBeInTheDocument();
  }

  it("asks for the code after the password and does not sign in until then", async () => {
    await reachCodeStep();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();

    completeMfaMock.mockResolvedValue(session);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "123 456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
    expect(completeMfaMock).toHaveBeenCalledWith({ mfaToken: "challenge-token", code: "123 456" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("keeps her on the code step after a wrong code", async () => {
    await reachCodeStep();
    completeMfaMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "That code is not right"),
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("That code is not right. Check your app and try again."),
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("offers to sign in again once the challenge has ended", async () => {
    await reachCodeStep();
    completeMfaMock.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "Too many wrong codes. Please sign in again."),
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "000000");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Too many wrong codes. Please sign in again."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("accepts a recovery code instead", async () => {
    await reachCodeStep();
    completeMfaMock.mockResolvedValue(session);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    await user.type(screen.getByLabelText("Recovery code"), "abcde-fghjk");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(completeMfaMock).toHaveBeenCalledWith({
        mfaToken: "challenge-token",
        code: "abcde-fghjk",
      }),
    );
  });
});
