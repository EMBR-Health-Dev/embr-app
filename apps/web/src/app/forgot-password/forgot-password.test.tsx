import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

const forgotPasswordMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      forgotPassword: (...args: unknown[]) => forgotPasswordMock(...args),
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

async function fillAndSubmit(email = "person@embr.health") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send reset link" }));
}

beforeEach(() => {
  forgotPasswordMock.mockReset();
});

describe("ForgotPassword page", () => {
  it("renders the form", async () => {
    const { default: ForgotPasswordPage } = await import("./page");
    renderWithIntl(<ForgotPasswordPage />);

    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
    expect(screen.getByText("Back to login").closest("a")).toHaveAttribute("href", "/login");
  });

  it("submits the entered email to api.auth.forgotPassword", async () => {
    forgotPasswordMock.mockResolvedValue(undefined);
    const { default: ForgotPasswordPage } = await import("./page");
    renderWithIntl(<ForgotPasswordPage />);

    await fillAndSubmit("person@embr.health");

    await waitFor(() => expect(forgotPasswordMock).toHaveBeenCalledWith("person@embr.health"));
  });

  it("shows the same success state whether or not an account exists for that email — the API itself never reveals which", async () => {
    // forgotPassword resolves (202) unconditionally server-side (see
    // auth.service.ts's forgotPassword: `if (!user) return;` — same
    // success response either way). The client's only job is to not
    // introduce a distinction the server was careful not to make.
    forgotPasswordMock.mockResolvedValue(undefined);
    const { default: ForgotPasswordPage } = await import("./page");
    renderWithIntl(<ForgotPasswordPage />);

    await fillAndSubmit("nobody-registered-with-this@embr.health");

    await waitFor(() => expect(screen.getByText("Check your email")).toBeInTheDocument());
    expect(
      screen.getByText("If an account exists for that email, a password reset link is on its way."),
    ).toBeInTheDocument();
  });

  it("shows a validation error for an invalid email without calling the API", async () => {
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("./page");
    renderWithIntl(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(screen.getByText("Must be a valid email address")).toBeInTheDocument();
    expect(forgotPasswordMock).not.toHaveBeenCalled();
  });

  it("shows the Japanese copy when that locale is active", async () => {
    forgotPasswordMock.mockResolvedValue(undefined);
    const { default: ForgotPasswordPage } = await import("./page");
    renderWithIntl(<ForgotPasswordPage />, "ja");

    expect(screen.getByText("パスワードを再設定")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("メールアドレス"), "person@embr.health");
    await user.click(screen.getByRole("button", { name: "再設定リンクを送信" }));

    await waitFor(() => expect(screen.getByText("メールをご確認ください")).toBeInTheDocument());
  });
});
