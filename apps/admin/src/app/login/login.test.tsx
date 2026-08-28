import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const refreshMock = vi.fn().mockResolvedValue(undefined);
const logoutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ refresh: refreshMock, logout: logoutMock }),
}));

const loginMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      login: (...args: unknown[]) => loginMock(...args),
    },
  },
}));

async function fillAndSubmit(email = "person@embr.health", password = "Sup3rSecret!Pass") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: /log in/i }));
  return user;
}

beforeEach(() => {
  routerPush.mockClear();
  refreshMock.mockClear();
  logoutMock.mockClear();
  loginMock.mockReset();
});

describe("Admin login — ADMIN-role gate", () => {
  // The account/password are genuinely correct in every case in this
  // block — the interesting behavior is entirely about what happens
  // to a valid session that isn't an admin's, since an admin console
  // must never leave a non-admin session sitting authenticated.
  it("logs a non-admin account back out immediately and shows an authorization error, without redirecting", async () => {
    loginMock.mockResolvedValue({
      user: { id: "u1", email: "person@embr.health", role: "MEMBER" },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    await fillAndSubmit();

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(screen.getByText("This account doesn't have admin access.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("refreshes and routes to /dashboard for an ADMIN account, without calling logout", async () => {
    loginMock.mockResolvedValue({
      user: { id: "u1", email: "admin@embr.health", role: "ADMIN" },
      accessToken: "at",
      refreshToken: "rt",
    });
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    await fillAndSubmit();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
    expect(refreshMock).toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});

describe("Admin login — validation and error handling", () => {
  it("shows field errors and never calls the API for an empty password", async () => {
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "person@embr.health");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Password is required")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("surfaces an ApiError's message directly", async () => {
    const { ApiError } = await import("../../lib/api-client");
    loginMock.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Invalid email or password"));
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    await fillAndSubmit();

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-ApiError failure", async () => {
    loginMock.mockRejectedValue(new Error("network exploded"));
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    await fillAndSubmit();

    expect(
      await screen.findByText("Something went wrong. Try again in a moment."),
    ).toBeInTheDocument();
  });

  it("disables the submit button and shows a logging-in state while the request is in flight", async () => {
    let resolveLogin!: (value: unknown) => void;
    loginMock.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    const { default: LoginPage } = await import("./page");
    render(<LoginPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "person@embr.health");
    await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("button", { name: "Logging in…" })).toBeDisabled();

    resolveLogin({
      user: { id: "u1", email: "admin@embr.health", role: "ADMIN" },
      accessToken: "at",
      refreshToken: "rt",
    });
    await waitFor(() => expect(routerPush).toHaveBeenCalled());
  });
});
