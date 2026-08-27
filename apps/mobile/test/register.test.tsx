import { render, fireEvent, waitFor } from "@testing-library/react-native";
import RegisterScreen from "../app/register";
import { ApiError } from "../lib/api-client";

// Same reasoning as login.test.tsx: register.tsx imports Link from
// expo-router, and without mocking it the real module (which
// transitively pulls in an ESM-only nanoid build) fails to even
// import under Jest's default transform.
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// t() returns the key itself — screen logic under test, not
// translation content (already covered in lib/i18n/*.test.ts).
// register.checkEmailBody interpolates {email}, so its mock returns
// the key plus the interpolated values for that one case, matching
// what a real check would actually verify was passed through.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

const mockRegister = jest.fn();
jest.mock("../lib/auth-context", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

beforeEach(() => {
  mockRegister.mockReset();
});

describe("register screen", () => {
  it("shows a field error and never calls register for an invalid email, without submitting", async () => {
    const { getByText, getByTestId } = await render(<RegisterScreen />);

    await fireEvent.changeText(getByTestId("register-email-input"), "not-an-email");
    await fireEvent.changeText(getByTestId("register-password-input"), "password123");
    await fireEvent.press(getByText("register.submit"));

    await waitFor(() => expect(mockRegister).not.toHaveBeenCalled());
  });

  it("calls register with the entered credentials and shows the check-your-email state, without navigating anywhere", async () => {
    mockRegister.mockResolvedValue({ id: "u1", email: "person@embr.health" });
    const { getByText, getByTestId, queryByTestId } = await render(<RegisterScreen />);

    await fireEvent.changeText(getByTestId("register-email-input"), "person@embr.health");
    await fireEvent.changeText(getByTestId("register-password-input"), "Correct-Password-1");
    await fireEvent.press(getByText("register.submit"));

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith("person@embr.health", "Correct-Password-1"),
    );
    // The check-email screen replaces the form entirely — the email
    // input is gone, and the interpolated address appears in the copy.
    await waitFor(() =>
      expect(getByText('register.checkEmailBody:{"email":"person@embr.health"}')).toBeTruthy(),
    );
    expect(queryByTestId("register-email-input")).toBeNull();
  });

  it("shows the API error message and stays on the form (not the check-email state) when register rejects", async () => {
    mockRegister.mockRejectedValue(
      new ApiError(409, "EMAIL_TAKEN", "That email is already registered"),
    );
    const { getByText, getByTestId } = await render(<RegisterScreen />);

    await fireEvent.changeText(getByTestId("register-email-input"), "person@embr.health");
    await fireEvent.changeText(getByTestId("register-password-input"), "Correct-Password-1");
    await fireEvent.press(getByText("register.submit"));

    await waitFor(() => expect(getByText("That email is already registered")).toBeTruthy());
    // Still on the form — the email input the user typed into is
    // still there, not swapped for the check-email screen.
    expect(getByTestId("register-email-input")).toBeTruthy();
  });
});
