// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- same i18next false positive as test/screens/brief.test.tsx */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "../../locales/en.json";

vi.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
vi.mock("../../lib/api-client", () => ({ ApiError: class ApiError extends Error {} }));
vi.mock("../../lib/auth-context", () => ({ useAuth: () => ({ register: vi.fn() }) }));

beforeAll(async () => {
  await i18next.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

describe("Register screen while sign up is closed", () => {
  it("sends people to sign up on the web instead of the sign up form", async () => {
    process.env.EXPO_PUBLIC_REGISTRATION_OPEN = "false";
    const { default: RegisterScreen } = await import("../../app/register");
    render(
      <I18nextProvider i18n={i18next}>
        <RegisterScreen />
      </I18nextProvider>,
    );

    expect(screen.getByText("Create your account on the web")).toBeInTheDocument();
    expect(screen.queryByText("Create account")).not.toBeInTheDocument();
    expect(screen.getByText("Sign up on the web")).toBeInTheDocument();
    process.env.EXPO_PUBLIC_REGISTRATION_OPEN = "true";
  });
});
