// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- same i18next false positive as test/screens/brief.test.tsx */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "../../locales/en.json";

const replace = vi.fn();
vi.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { replace: (...a: unknown[]) => replace(...a) },
  useLocalSearchParams: () => ({}),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
vi.mock("../../components/language-switcher", () => ({ LanguageSwitcher: () => null }));
vi.mock("../../components/brand-wordmark", () => ({ BrandWordmark: () => null }));
vi.mock("../../lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const login = vi.fn();
const completeMfa = vi.fn();
vi.mock("../../lib/auth-context", () => ({ useAuth: () => ({ login, completeMfa }) }));

beforeAll(async () => {
  await i18next.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  replace.mockReset();
  login.mockReset();
  completeMfa.mockReset();
});

async function reachCodeStep() {
  login.mockResolvedValue({ mfaToken: "challenge-token" });
  const { default: LoginScreen } = await import("../../app/login");
  render(
    <I18nextProvider i18n={i18next}>
      <LoginScreen />
    </I18nextProvider>,
  );
  fireEvent.change(screen.getAllByRole("textbox")[0]!, {
    target: { value: "person@embr.health" },
  });
  const password = document.querySelector('input[type="password"]') as HTMLInputElement;
  fireEvent.change(password, { target: { value: "Sup3rSecret!Pass" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
  expect(await screen.findByText("Enter your code")).toBeInTheDocument();
}

describe("Login screen — two-step sign in", () => {
  it("asks for the code after the password and signs in only with it", async () => {
    await reachCodeStep();
    expect(replace).not.toHaveBeenCalled();

    completeMfa.mockResolvedValue({ onboardingCompletedAt: "2026-10-01" });
    fireEvent.change(screen.getByLabelText("6 digit code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/(app)"));
    expect(completeMfa).toHaveBeenCalledWith("challenge-token", "123456");
  });

  it("keeps her on the step after a wrong code", async () => {
    await reachCodeStep();
    const { ApiError } = await import("../../lib/api-client");
    completeMfa.mockRejectedValue(new ApiError(400, "VALIDATION_ERROR", "That code is not right"));
    fireEvent.change(screen.getByLabelText("6 digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("That code is not right. Check your app and try again."),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers to sign in again when the challenge has ended", async () => {
    await reachCodeStep();
    const { ApiError } = await import("../../lib/api-client");
    completeMfa.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "Too many wrong codes. Please sign in again."),
    );
    fireEvent.change(screen.getByLabelText("6 digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Too many wrong codes. Please sign in again."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  });

  it("accepts a recovery code instead", async () => {
    await reachCodeStep();
    completeMfa.mockResolvedValue({ onboardingCompletedAt: null });
    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "ABCDE-FGHJK" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
    expect(completeMfa).toHaveBeenCalledWith("challenge-token", "ABCDE-FGHJK");
  });
});
