import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { ApiError } from "../../lib/api-client";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  // For the page's LanguageSwitcher.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const registerMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: { auth: { register: (...args: unknown[]) => registerMock(...args) } },
}));

function renderPage(locale: "en" | "ja" = "en") {
  return import("./page").then(({ default: RegisterPage }) =>
    render(
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ja}>
        <RegisterPage />
      </NextIntlClientProvider>,
    ),
  );
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "person@embr.health");
  await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
}

const termsBox = () => screen.getByRole("checkbox", { name: /private early access/ });
const privacyBox = () => screen.getByRole("checkbox", { name: /how my information will be used/ });
const healthBox = () => screen.getByRole("checkbox", { name: /health information I provide/ });

beforeEach(() => {
  registerMock.mockReset();
});

describe("Register — consent", () => {
  it("shows three separate boxes, none pre-checked", async () => {
    await renderPage();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(termsBox()).not.toBeChecked();
    expect(privacyBox()).not.toBeChecked();
    expect(healthBox()).not.toBeChecked();
    expect(screen.getByText(/uses the health information you choose to enter/)).toBeInTheDocument();
  });

  it("does not link to or ask agreement to unpublished Terms or Privacy Policy", async () => {
    await renderPage();
    expect(screen.queryByRole("link", { name: /Terms of Use|Privacy Policy/ })).toBeNull();
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toHaveAccessibleName(/Terms of Use|Privacy Policy/);
    }
    expect(
      screen.getByText(
        "The Terms of Use and Privacy Policy will be published before sign-up opens.",
      ),
    ).toBeInTheDocument();
  });

  it("does not submit without Terms and Privacy, and says why", async () => {
    const user = userEvent.setup();
    await renderPage();
    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(registerMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Please confirm this item to continue.")).toHaveLength(2);
  });

  it("sends each ticked item with the version shown, the language and the client", async () => {
    registerMock.mockResolvedValue({});
    const user = userEvent.setup();
    await renderPage();
    await fillCredentials(user);
    await user.click(termsBox());
    await user.click(privacyBox());
    await user.click(healthBox());
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
    expect(registerMock).toHaveBeenCalledWith({
      email: "person@embr.health",
      password: "Sup3rSecret!Pass",
      consents: [
        { type: "TERMS", version: LEGAL_DOCUMENT_VERSIONS.TERMS },
        { type: "PRIVACY", version: LEGAL_DOCUMENT_VERSIONS.PRIVACY },
        { type: "HEALTH_PROCESSING", version: LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING },
      ],
      locale: "en",
      client: "web",
    });
  });

  it("leaves the health item out when it isn't ticked (the server decides whether it's required)", async () => {
    registerMock.mockResolvedValue({});
    const user = userEvent.setup();
    await renderPage();
    await fillCredentials(user);
    await user.click(termsBox());
    await user.click(privacyBox());
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
    const sent = registerMock.mock.calls[0]![0] as { consents: Array<{ type: string }> };
    expect(sent.consents.map((c) => c.type)).toEqual(["TERMS", "PRIVACY"]);
  });

  it("shows the server's answer against the health box when it's required", async () => {
    registerMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Please review", [
        { field: "consents.HEALTH_PROCESSING", message: "Required" },
      ]),
    );
    const user = userEvent.setup();
    await renderPage();
    await fillCredentials(user);
    await user.click(termsBox());
    await user.click(privacyBox());
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Please review this item to continue.")).toBeInTheDocument();
    expect(healthBox()).toHaveAttribute("aria-invalid", "true");
  });

  it("asks for a reload when the documents changed while the page was open", async () => {
    registerMock.mockRejectedValue(new ApiError(409, "CONSENT_VERSION_OUTDATED", "Outdated"));
    const user = userEvent.setup();
    await renderPage();
    await fillCredentials(user);
    await user.click(termsBox());
    await user.click(privacyBox());
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Please reload the page/)).toBeInTheDocument();
  });

  it("renders the consent wording in Japanese and sends locale ja", async () => {
    registerMock.mockResolvedValue({});
    const user = userEvent.setup();
    await renderPage("ja");
    expect(screen.getByRole("checkbox", { name: /テスト段階/ })).not.toBeChecked();
    expect(
      screen.getByText(/利用規約とプライバシーポリシーは、新規登録の受付開始前に公開します/),
    ).toBeInTheDocument();
    // The explanation names what is handled and why, once, right before the box.
    expect(
      screen.getByText(/EMBRの記録の提供、時間による変化の表示、EMBR BRIEFの作成/),
    ).toBeInTheDocument();
    const health = screen.getByRole("checkbox", { name: /私が提供する健康情報/ });
    expect(health).toHaveAccessibleName(/これらの目的のためにEMBRが取り扱うことに同意します/);
    expect(health).not.toBeChecked();
    expect(screen.getByText(/同意に基づく取り扱いについては/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("メールアドレス"), "person@embr.health");
    await user.type(screen.getByLabelText("パスワード"), "Sup3rSecret!Pass");
    const boxes = screen.getAllByRole("checkbox");
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(screen.getByRole("button", { name: "アカウントを作成" }));

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
    expect((registerMock.mock.calls[0]![0] as { locale: string }).locale).toBe("ja");
  });
});
