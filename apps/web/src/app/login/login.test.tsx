import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

    render(<LoginPage />);
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

    render(<LoginPage />);
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

    render(<LoginPage />);
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

    render(<LoginPage />);
    await fillAndSubmit();

    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/organizations/accept-invite?token=abc"),
    );
  });
});
