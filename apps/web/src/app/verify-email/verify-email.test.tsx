import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsValue,
}));

const verifyEmailMock = vi.fn();
const resendVerificationMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      verifyEmail: (...args: unknown[]) => verifyEmailMock(...args),
      resendVerification: (...args: unknown[]) => resendVerificationMock(...args),
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

beforeEach(() => {
  verifyEmailMock.mockReset();
  resendVerificationMock.mockReset();
  searchParamsValue = new URLSearchParams({ token: "a-valid-token" });
});

describe("VerifyEmail page", () => {
  it("shows a loading state while verification is in flight, and submits the token from the URL", async () => {
    let resolveVerify: () => void = () => {};
    verifyEmailMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveVerify = resolve;
      }),
    );

    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    expect(screen.getByText("Verifying your email…")).toBeInTheDocument();
    expect(verifyEmailMock).toHaveBeenCalledWith("a-valid-token");

    resolveVerify();
    await waitFor(() =>
      expect(screen.queryByText("Verifying your email…")).not.toBeInTheDocument(),
    );
  });

  it("shows the success state once verification succeeds, with a link back to login", async () => {
    verifyEmailMock.mockResolvedValue(undefined);
    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("Email verified")).toBeInTheDocument());
    expect(
      screen.getByText("Your email address is confirmed. You can log in now."),
    ).toBeInTheDocument();
    expect(screen.getByText("Go to login").closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows the server's specific message for an invalid, expired, or already-consumed token", async () => {
    const { ApiError } = await import("../../lib/api-client");
    verifyEmailMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "This verification link is invalid or has expired"),
    );
    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("Link invalid or expired")).toBeInTheDocument());
    // The exact message the server returned — not a generic fallback —
    // for any of invalid, expired, or already-consumed, since the
    // server itself doesn't distinguish those cases either.
    expect(
      screen.getByText("This verification link is invalid or has expired"),
    ).toBeInTheDocument();
  });

  it("shows the same dead-end state, without ever calling the API, when there's no token in the URL at all", async () => {
    searchParamsValue = new URLSearchParams(); // no ?token=
    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    expect(screen.getByText("Link invalid or expired")).toBeInTheDocument();
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it("offers a resend form from the error state, calling api.auth.resendVerification with the entered email", async () => {
    verifyEmailMock.mockRejectedValue(new Error("expired"));
    resendVerificationMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("Link invalid or expired")).toBeInTheDocument());
    await user.type(screen.getByLabelText("Email"), "person@embr.health");
    await user.click(screen.getByRole("button", { name: "Resend verification email" }));

    await waitFor(() => expect(resendVerificationMock).toHaveBeenCalledWith("person@embr.health"));
    expect(
      screen.getByText(
        "If that account exists and isn't already verified, a new verification link is on its way.",
      ),
    ).toBeInTheDocument();
  });

  it("has a 'Back to login' link in the error state", async () => {
    verifyEmailMock.mockRejectedValue(new Error("expired"));
    const { default: VerifyEmailPage } = await import("./page");
    renderWithIntl(<VerifyEmailPage />);

    await waitFor(() => expect(screen.getByText("Link invalid or expired")).toBeInTheDocument());
    expect(screen.getByText("Back to login").closest("a")).toHaveAttribute("href", "/login");
  });
});
