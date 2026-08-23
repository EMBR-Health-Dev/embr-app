import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

// A stable object reference (not a fresh literal per call) — see
// dashboard.test.tsx's identical fix/comment: the settings page's
// session-loading effect depends on [user], and a fresh literal here
// would make that effect re-fire on every render. emailVerified is
// mutated directly (not replaced) between tests that need the other
// state, for the same reason — the reference itself must stay stable.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  emailVerified: false,
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const deleteAccountMock = vi.fn();
const resendVerificationMock = vi.fn();
const sessionsListMock = vi.fn().mockResolvedValue([]);
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      sessions: { list: (...args: unknown[]) => sessionsListMock(...args) },
      deleteAccount: (...args: unknown[]) => deleteAccountMock(...args),
      resendVerification: (...args: unknown[]) => resendVerificationMock(...args),
      changePassword: vi.fn(),
      logoutAll: vi.fn(),
    },
  },
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

async function openDeleteConfirmation() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
  return user;
}

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  deleteAccountMock.mockReset();
  resendVerificationMock.mockReset();
  sessionsListMock.mockClear();
  mockUser.emailVerified = false;
});

describe("Settings — account deletion password recovery link", () => {
  it("does not show the password recovery link before deletion is confirmed", async () => {
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Reset it")).not.toBeInTheDocument();
  });

  it("renders the password recovery link once deletion is confirmed", async () => {
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    await openDeleteConfirmation();

    expect(screen.getByText("Don't know your password?")).toBeInTheDocument();
    expect(screen.getByText("Reset it")).toBeInTheDocument();
  });

  it("the password recovery link points to /forgot-password", async () => {
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    await openDeleteConfirmation();

    expect(screen.getByText("Reset it").closest("a")).toHaveAttribute("href", "/forgot-password");
  });
});

describe("Settings — account deletion behavior (unchanged)", () => {
  it("requires clicking 'Delete my account' before the password field appears", async () => {
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    expect(screen.queryByLabelText("Confirm your password")).not.toBeInTheDocument();
  });

  it("shows an error and does not redirect when the API rejects the password", async () => {
    const { ApiError } = await import("../../lib/api-client");
    deleteAccountMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Password is incorrect"),
    );
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    const user = await openDeleteConfirmation();
    await user.type(screen.getByLabelText("Confirm your password"), "WrongPassword1!");
    await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));

    await waitFor(() => expect(screen.getByText("Password is incorrect")).toBeInTheDocument());
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("calls api.auth.deleteAccount with the entered password and redirects to /login on success", async () => {
    deleteAccountMock.mockResolvedValue(undefined);
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    const user = await openDeleteConfirmation();
    await user.type(screen.getByLabelText("Confirm your password"), "Sup3rSecret!Pass");
    await user.click(screen.getByRole("button", { name: "Permanently delete my account" }));

    await waitFor(() =>
      expect(deleteAccountMock).toHaveBeenCalledWith({ password: "Sup3rSecret!Pass" }),
    );
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/login"));
  });

  it("cancel clears the password field and hides the confirmation step again", async () => {
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument(),
    );

    const user = await openDeleteConfirmation();
    await user.type(screen.getByLabelText("Confirm your password"), "something");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Confirm your password")).not.toBeInTheDocument();
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });
});

describe("Settings — email verification status", () => {
  it("shows the unverified state and a resend action for an unverified user", async () => {
    mockUser.emailVerified = false;
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);

    await waitFor(() =>
      expect(screen.getByText("Your email address isn't verified yet.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Resend verification email")).toBeInTheDocument();
    expect(screen.queryByText("Your email is verified.")).not.toBeInTheDocument();
  });

  it("shows the verified state, with no resend action, for a verified user", async () => {
    mockUser.emailVerified = true;
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);

    await waitFor(() => expect(screen.getByText("Your email is verified.")).toBeInTheDocument());
    expect(screen.queryByText("Resend verification email")).not.toBeInTheDocument();
    expect(screen.queryByText("Your email address isn't verified yet.")).not.toBeInTheDocument();
  });

  it("calls api.auth.resendVerification with the account's email and shows a success state", async () => {
    mockUser.emailVerified = false;
    resendVerificationMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);

    await waitFor(() => expect(screen.getByText("Resend verification email")).toBeInTheDocument());
    await user.click(screen.getByText("Resend verification email"));

    await waitFor(() => expect(resendVerificationMock).toHaveBeenCalledWith("person@embr.health"));
    expect(
      screen.getByText(
        "If your email isn't already verified, a new verification link is on its way.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error state, not a crash, if resend fails", async () => {
    mockUser.emailVerified = false;
    const { ApiError } = await import("../../lib/api-client");
    resendVerificationMock.mockRejectedValue(
      new ApiError(429, "RATE_LIMITED", "Too many requests — please try again later"),
    );
    const user = userEvent.setup();
    const { default: SettingsPage } = await import("./page");
    renderWithIntl(<SettingsPage />);

    await waitFor(() => expect(screen.getByText("Resend verification email")).toBeInTheDocument());
    await user.click(screen.getByText("Resend verification email"));

    await waitFor(() =>
      expect(screen.getByText("Too many requests — please try again later")).toBeInTheDocument(),
    );
    // Still offers the resend action again rather than getting stuck.
    expect(screen.getByText("Resend verification email")).toBeInTheDocument();
  });
});
