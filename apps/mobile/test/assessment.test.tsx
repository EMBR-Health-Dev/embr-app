import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AssessmentScreen from "../app/assessment";

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// t() returns the key itself — screen logic under test (submit
// payload shape, tier rendering, navigation), not translation
// content, which already has its own dedicated coverage in
// lib/i18n/*.test.ts. enums.category.* keys are used as Chip labels,
// so they need to resolve to *something* queryable — returning the
// full key (e.g. "enums.category.HOT_FLASH") is enough to select a
// specific chip by name without needing real translations loaded.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockSubmit = jest.fn();
jest.mock("../lib/api", () => ({
  api: { publicAssessment: { submit: (...args: unknown[]) => mockSubmit(...args) } },
}));

beforeEach(() => {
  mockRouterPush.mockClear();
  mockSubmit.mockReset();
});

describe("assessment screen", () => {
  it("submits the selected symptoms and irregular-periods flag, then shows the high-tier result", async () => {
    mockSubmit.mockResolvedValue({ score: 3, tier: "high" });
    const { getByText, getByRole } = await render(<AssessmentScreen />);

    await fireEvent.press(getByRole("button", { name: "enums.category.HOT_FLASH" }));
    await fireEvent.press(getByRole("button", { name: "enums.category.NIGHT_SWEATS" }));
    await fireEvent.press(getByRole("button", { name: "assessment.irregularPeriodsLabel" }));
    await fireEvent.press(getByText("assessment.submit"));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        symptoms: ["HOT_FLASH", "NIGHT_SWEATS"],
        hasIrregularPeriods: true,
      }),
    );
    await waitFor(() => expect(getByText("assessment.highTierTitle")).toBeTruthy());
  });

  it("submits an empty symptom list and false irregular-periods when nothing is selected", async () => {
    mockSubmit.mockResolvedValue({ score: 0, tier: "low" });
    const { getByText } = await render(<AssessmentScreen />);

    await fireEvent.press(getByText("assessment.submit"));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({ symptoms: [], hasIrregularPeriods: false }),
    );
    await waitFor(() => expect(getByText("assessment.lowTierTitle")).toBeTruthy());
  });

  it("pressing a symptom chip twice deselects it — it isn't included in the submitted list", async () => {
    mockSubmit.mockResolvedValue({ score: 0, tier: "low" });
    const { getByText, getByRole } = await render(<AssessmentScreen />);

    const chip = getByRole("button", { name: "enums.category.HOT_FLASH" });
    await fireEvent.press(chip);
    await fireEvent.press(chip);
    await fireEvent.press(getByText("assessment.submit"));

    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({ symptoms: [], hasIrregularPeriods: false }),
    );
  });

  it("shows a generic error and stays on the form when the request fails", async () => {
    mockSubmit.mockRejectedValue(new Error("network down"));
    const { getByText } = await render(<AssessmentScreen />);

    await fireEvent.press(getByText("assessment.submit"));

    await waitFor(() => expect(getByText("assessment.genericError")).toBeTruthy());
    // Still on the form, not the result screen.
    expect(getByText("assessment.submit")).toBeTruthy();
  });

  it("the create-account CTA on the result screen navigates to /register", async () => {
    mockSubmit.mockResolvedValue({ score: 3, tier: "high" });
    const { getByText } = await render(<AssessmentScreen />);

    await fireEvent.press(getByText("assessment.submit"));
    await waitFor(() => expect(getByText("assessment.createAccount")).toBeTruthy());
    await fireEvent.press(getByText("assessment.createAccount"));

    expect(mockRouterPush).toHaveBeenCalledWith("/register");
  });
});
