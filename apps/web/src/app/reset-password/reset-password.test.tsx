import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsValue,
}));

const resetPasswordMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
    },
  },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const VALID_PASSWORD = "Sup3rSecret!Pass";

async function fillAndSubmit(password: string, confirmPassword: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("New password"), password);
  await user.type(screen.getByLabelText("Confirm new password"), confirmPassword);
  await user.click(screen.getByRole("button", { name: "Reset password" }));
}

beforeEach(() => {
  resetPasswordMock.mockReset();
  searchParamsValue = new URLSearchParams({ token: "a-valid-token" });
});

describe("ResetPassword page", () => {
  it("renders the form when a token is present in the URL", async () => {
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    expect(screen.getByText("Choose a new password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("shows an invalid-link state and no form when the token is missing from the URL", async () => {
    searchParamsValue = new URLSearchParams(); // no ?token=
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    expect(screen.getByText("Link invalid or expired")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByText("Request a new link").closest("a")).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("rejects a password/confirmation mismatch client-side, without calling the API", async () => {
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    await fillAndSubmit(VALID_PASSWORD, "SomethingDifferent1");

    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a password that fails the shared password schema, without calling the API", async () => {
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    // Too short, and missing a digit — reuses passwordSchema from
    // @embr/validation rather than any hand-rolled client-side rule.
    await fillAndSubmit("short", "short");

    expect(screen.getByText("Password must be at least 12 characters")).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("sends the token from the URL and the new password to api.auth.resetPassword, and shows the success state", async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    await fillAndSubmit(VALID_PASSWORD, VALID_PASSWORD);

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        token: "a-valid-token",
        password: VALID_PASSWORD,
      }),
    );
    expect(screen.getByText("Password reset")).toBeInTheDocument();
    expect(
      screen.getByText("Your password has been changed. Log in with your new password."),
    ).toBeInTheDocument();
    // Returns the person to login rather than trying to authenticate
    // them automatically — a plain link, no session is established
    // here.
    expect(screen.getByText("Go to login").closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows a useful error, not a crash, when the API rejects an expired or invalid token", async () => {
    const { ApiError } = await import("../../lib/api-client");
    resetPasswordMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "This password reset link is invalid or has expired"),
    );
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />);

    await fillAndSubmit(VALID_PASSWORD, VALID_PASSWORD);

    await waitFor(() =>
      expect(
        screen.getByText("This password reset link is invalid or has expired"),
      ).toBeInTheDocument(),
    );
  });

  it("shows the Japanese copy when that locale is active", async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    const { default: ResetPasswordPage } = await import("./page");
    renderWithIntl(<ResetPasswordPage />, "ja");

    expect(screen.getByText("新しいパスワードを設定")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("新しいパスワード"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("新しいパスワード(確認)"), VALID_PASSWORD);
    await user.click(screen.getByRole("button", { name: "パスワードを再設定" }));

    await waitFor(() => expect(screen.getByText("パスワードを再設定しました")).toBeInTheDocument());
  });
});
