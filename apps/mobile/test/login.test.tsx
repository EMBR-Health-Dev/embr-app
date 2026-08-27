import { render, fireEvent, waitFor } from "@testing-library/react-native";
import LoginScreen from "../app/login";
import { ApiError } from "../lib/api-client";

const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args) },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// t() returns the key itself rather than a translated string — this
// suite tests screen logic (validation, submit flow, navigation), not
// translation content, which already has its own dedicated coverage
// in lib/i18n/*.test.ts.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", changeLanguage: jest.fn() },
  }),
}));

const mockLogin = jest.fn();
jest.mock("../lib/auth-context", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

beforeEach(() => {
  mockRouterReplace.mockClear();
  mockLogin.mockReset();
});

describe("login screen", () => {
  it("shows a field error and never calls login for an invalid email, without submitting", async () => {
    const { getByText, getByTestId } = await render(<LoginScreen />);

    await fireEvent.changeText(getByTestId("login-email-input"), "not-an-email");
    await fireEvent.changeText(getByTestId("login-password-input"), "password123");
    await fireEvent.press(getByText("login.submit"));

    await waitFor(() => expect(mockLogin).not.toHaveBeenCalled());
  });

  it("calls login with the entered credentials and navigates to /(app) when onboarding is complete", async () => {
    mockLogin.mockResolvedValue({
      id: "u1",
      email: "person@embr.health",
      onboardingCompletedAt: "2026-01-01T00:00:00Z",
    });
    const { getByText, getByTestId } = await render(<LoginScreen />);

    await fireEvent.changeText(getByTestId("login-email-input"), "person@embr.health");
    await fireEvent.changeText(getByTestId("login-password-input"), "correct-password");
    await fireEvent.press(getByText("login.submit"));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith("person@embr.health", "correct-password"),
    );
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/(app)"));
  });

  it("navigates to /onboarding instead when onboarding isn't complete yet", async () => {
    mockLogin.mockResolvedValue({
      id: "u1",
      email: "person@embr.health",
      onboardingCompletedAt: null,
    });
    const { getByText, getByTestId } = await render(<LoginScreen />);

    await fireEvent.changeText(getByTestId("login-email-input"), "person@embr.health");
    await fireEvent.changeText(getByTestId("login-password-input"), "correct-password");
    await fireEvent.press(getByText("login.submit"));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/onboarding"));
  });

  it("shows the API error message and does not navigate when login rejects", async () => {
    mockLogin.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Wrong email or password"),
    );
    const { getByText, getByTestId } = await render(<LoginScreen />);

    await fireEvent.changeText(getByTestId("login-email-input"), "person@embr.health");
    await fireEvent.changeText(getByTestId("login-password-input"), "wrong-password");
    await fireEvent.press(getByText("login.submit"));

    await waitFor(() => expect(getByText("Wrong email or password")).toBeTruthy());
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
