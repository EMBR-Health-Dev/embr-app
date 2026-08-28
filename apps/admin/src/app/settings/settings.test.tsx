import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

// A stable object reference, not a fresh literal per call — the
// sessions-loading effect depends on [isAdmin], and mockAuth itself is
// read fresh by every render, so mutating its fields between tests
// (rather than replacing the object) is what keeps that effect from
// re-firing spuriously. Same precedent as apps/web's settings/
// dashboard tests.
const mockAuth = {
  user: { id: "u1", email: "admin@embr.health", role: "ADMIN" as "ADMIN" | "MEMBER" },
  isAdmin: true,
  loading: false,
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => mockAuth,
}));

const changePasswordMock = vi.fn();
const sessionsListMock = vi.fn().mockResolvedValue([]);
const sessionsRevokeMock = vi.fn().mockResolvedValue(undefined);
const logoutAllMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      changePassword: (...args: unknown[]) => changePasswordMock(...args),
      sessions: {
        list: (...args: unknown[]) => sessionsListMock(...args),
        revoke: (...args: unknown[]) => sessionsRevokeMock(...args),
      },
      logoutAll: (...args: unknown[]) => logoutAllMock(...args),
    },
  },
}));

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  changePasswordMock.mockReset();
  sessionsListMock.mockClear();
  sessionsListMock.mockResolvedValue([]);
  sessionsRevokeMock.mockClear();
  logoutAllMock.mockClear();
  mockAuth.user = { id: "u1", email: "admin@embr.health", role: "ADMIN" };
  mockAuth.isAdmin = true;
  mockAuth.loading = false;
});

async function submitPasswordChange(current = "OldPass123!", next = "NewPassword456!") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.click(screen.getByRole("button", { name: /change password/i }));
  return user;
}

describe("Admin settings — access gating", () => {
  it("shows a loading state before the auth check resolves", async () => {
    mockAuth.loading = true;
    // @ts-expect-error -- deliberately unresolved auth state for this case
    mockAuth.user = null;
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("Change password")).not.toBeInTheDocument();
  });

  it("shows a not-authorized screen for a signed-in non-admin, without fetching sessions", async () => {
    mockAuth.isAdmin = false;
    mockAuth.user = { id: "u1", email: "person@embr.health", role: "MEMBER" };
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);

    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(screen.getByText(/person@embr\.health doesn't have admin access/)).toBeInTheDocument();
    expect(sessionsListMock).not.toHaveBeenCalled();
  });
});

describe("Admin settings — change password", () => {
  it("shows field errors and never calls the API when the new password fails the policy", async () => {
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);
    await waitFor(() => expect(sessionsListMock).toHaveBeenCalled());

    await submitPasswordChange("OldPass123!", "Ab1defghij");

    expect(await screen.findByText("Password must be at least 12 characters")).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("redirects to /login with the password-changed reason on success", async () => {
    changePasswordMock.mockResolvedValue(undefined);
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);
    await waitFor(() => expect(sessionsListMock).toHaveBeenCalled());

    await submitPasswordChange();

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/login?reason=password-changed"));
    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: "OldPass123!",
      newPassword: "NewPassword456!",
    });
  });

  it("surfaces an ApiError's message and does not redirect", async () => {
    const { ApiError } = await import("../../lib/api-client");
    changePasswordMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Current password is incorrect"),
    );
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);
    await waitFor(() => expect(sessionsListMock).toHaveBeenCalled());

    await submitPasswordChange();

    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("Admin settings — device sessions", () => {
  it("shows an empty state when there are no sessions", async () => {
    sessionsListMock.mockResolvedValue([]);
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);

    expect(await screen.findByText("No active sessions.")).toBeInTheDocument();
  });

  it("marks the current session and offers Revoke only for the others", async () => {
    sessionsListMock.mockResolvedValue([
      {
        id: "s1",
        userAgent: "Chrome on macOS",
        ipAddress: "1.1.1.1",
        createdAt: "2026-01-01T00:00:00Z",
        current: true,
      },
      {
        id: "s2",
        userAgent: "Safari on iOS",
        ipAddress: "2.2.2.2",
        createdAt: "2026-01-02T00:00:00Z",
        current: false,
      },
    ]);
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);

    await waitFor(() => expect(screen.getByText("Safari on iOS")).toBeInTheDocument());
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("revoking a session removes it from the list", async () => {
    sessionsListMock.mockResolvedValue([
      {
        id: "s2",
        userAgent: "Safari on iOS",
        ipAddress: "2.2.2.2",
        createdAt: "2026-01-02T00:00:00Z",
        current: false,
      },
    ]);
    sessionsRevokeMock.mockResolvedValue(undefined);
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("Safari on iOS")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(sessionsRevokeMock).toHaveBeenCalledWith("s2"));
    await waitFor(() => expect(screen.queryByText("Safari on iOS")).not.toBeInTheDocument());
  });

  it("logging out everywhere calls the API and redirects to /login", async () => {
    logoutAllMock.mockResolvedValue(undefined);
    const { default: SettingsPage } = await import("./page");
    render(<SettingsPage />);
    await waitFor(() => expect(sessionsListMock).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /log out everywhere/i }));

    await waitFor(() => expect(logoutAllMock).toHaveBeenCalled());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/login"));
  });
});
