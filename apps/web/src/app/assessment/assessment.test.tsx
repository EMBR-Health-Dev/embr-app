import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

const submitMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    publicAssessment: {
      submit: (...args: unknown[]) => submitMock(...args),
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
  routerPush.mockClear();
  submitMock.mockReset();
});

describe("Assessment — submitting", () => {
  it("submits the selected symptoms and irregular-periods flag, then shows the high-tier result", async () => {
    submitMock.mockResolvedValue({ score: 3, tier: "high" });
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByLabelText("Hot Flash"));
    await user.click(screen.getByLabelText("Night Sweats"));
    await user.click(screen.getByLabelText("My periods have become irregular"));
    await user.click(screen.getByRole("button", { name: "See my result" }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith({
        symptoms: ["HOT_FLASH", "NIGHT_SWEATS"],
        hasIrregularPeriods: true,
      }),
    );
    expect(
      screen.getByText("This may be worth a conversation with a specialist"),
    ).toBeInTheDocument();
  });

  it("shows the low-tier result for a low-tier response", async () => {
    submitMock.mockResolvedValue({ score: 0, tier: "low" });
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByRole("button", { name: "See my result" }));

    await waitFor(() =>
      expect(screen.getByText("Nothing urgent stands out here")).toBeInTheDocument(),
    );
  });

  it("submits an empty symptom list and false irregular-periods when nothing is checked", async () => {
    submitMock.mockResolvedValue({ score: 0, tier: "low" });
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByRole("button", { name: "See my result" }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith({ symptoms: [], hasIrregularPeriods: false }),
    );
  });

  it("shows a translated error and stays on the form when the request fails", async () => {
    const { ApiError } = await import("../../lib/api-client");
    submitMock.mockRejectedValue(new ApiError(429, "RATE_LIMITED", "Too many requests"));
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByRole("button", { name: "See my result" }));

    await waitFor(() => expect(screen.getByText("Too many requests")).toBeInTheDocument());
    // Still on the form, not the result screen.
    expect(screen.getByRole("button", { name: "See my result" })).toBeInTheDocument();
  });

  it("the create-account CTA on the result screen navigates to /register", async () => {
    submitMock.mockResolvedValue({ score: 3, tier: "high" });
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByRole("button", { name: "See my result" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Create a free account" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Create a free account" }));

    expect(routerPush).toHaveBeenCalledWith("/register");
  });

  it("the result screen's login link points at /login", async () => {
    submitMock.mockResolvedValue({ score: 3, tier: "high" });
    const user = userEvent.setup();
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    await user.click(screen.getByRole("button", { name: "See my result" }));

    const link = await screen.findByText("Already have an account? Log in");
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });
});

describe("Assessment — translation", () => {
  it("renders English strings by default", async () => {
    const { default: AssessmentPage } = await import("./page");
    renderWithIntl(<AssessmentPage />);

    expect(screen.getByText("Perimenopause self-assessment")).toBeInTheDocument();
    expect(screen.getByLabelText("Hot Flash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See my result" })).toBeInTheDocument();
  });

  it("renders Japanese strings when the ja locale is active", async () => {
    const { default: AssessmentPage } = await import("./page");
    render(
      <NextIntlClientProvider locale="ja" messages={ja}>
        <AssessmentPage />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("更年期セルフチェック")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "結果を見る" })).toBeInTheDocument();
  });
});
