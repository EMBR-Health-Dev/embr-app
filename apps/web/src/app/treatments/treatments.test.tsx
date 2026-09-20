import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { TreatmentDto, TreatmentImpactDto } from "@embr/types";
import { ApiError } from "../../lib/api-client";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

// A stable object reference (not a fresh literal per call) — the
// treatments page's load effect depends on [user] in its dependency
// array, and the real AuthProvider only produces a new reference when
// auth state genuinely changes. A fresh literal here would make that
// effect re-fire on every render, resetting treatmentsLoading back to
// true in a loop — see dashboard.test.tsx's identical fix and comment.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

const treatment: TreatmentDto = {
  id: "t1",
  name: "Estradiol patch",
  category: "HRT",
  startDate: "2026-06-01",
  endDate: null,
  notes: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const listMock = vi.fn().mockResolvedValue({
  items: [treatment],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
});
const impactMock = vi.fn();
const createMock = vi.fn().mockResolvedValue(treatment);

vi.mock("../../lib/api", () => ({
  api: {
    treatments: {
      list: (...args: unknown[]) => listMock(...args),
      impact: (...args: unknown[]) => impactMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: vi.fn(),
      delete: vi.fn(),
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

function populatedImpact(overrides: Partial<TreatmentImpactDto> = {}): TreatmentImpactDto {
  return {
    treatmentId: "t1",
    windowDays: 14,
    before: { logCount: 5, days: 14 },
    after: { logCount: 2, days: 14 },
    insufficientData: false,
    ...overrides,
  };
}

beforeEach(() => {
  listMock.mockClear();
  impactMock.mockReset();
  createMock.mockReset().mockResolvedValue(treatment);
});

describe("Treatments page — impact section", () => {
  it("shows the 'See impact' toggle for a treatment but nothing expanded by default", async () => {
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    expect(screen.getByText("See impact")).toBeInTheDocument();
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("shows a loading state while the impact request is in flight", async () => {
    let resolveImpact: (value: TreatmentImpactDto) => void = () => {};
    impactMock.mockReturnValue(
      new Promise<TreatmentImpactDto>((resolve) => {
        resolveImpact = resolve;
      }),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));

    await waitFor(() => expect(screen.getByText("Loading…")).toBeInTheDocument());

    resolveImpact(populatedImpact());
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it("shows before/after counts and the non-efficacy disclaimer once impact data loads", async () => {
    impactMock.mockResolvedValue(
      populatedImpact({
        before: { logCount: 5, days: 14 },
        after: { logCount: 2, days: 14 },
      }),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));

    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    expect(screen.getByText("Symptom logs since treatment began")).toBeInTheDocument();
    expect(screen.getByText("5 · 14 days")).toBeInTheDocument();
    expect(screen.getByText("2 · 14 days")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A count of how often you logged symptoms, not a measure of whether the treatment is working.",
      ),
    ).toBeInTheDocument();

    // The toggle now hides it.
    await user.click(screen.getByText("Hide impact"));
    expect(screen.queryByText("Symptom logs before treatment")).not.toBeInTheDocument();
  });

  it("only fetches impact once per treatment, even when toggled multiple times", async () => {
    impactMock.mockResolvedValue(populatedImpact());

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));
    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Hide impact"));
    await user.click(screen.getByText("See impact"));

    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    expect(impactMock).toHaveBeenCalledTimes(1);
  });

  it("shows a neutral message, not a claim, when there isn't enough data yet", async () => {
    impactMock.mockResolvedValue(populatedImpact({ insufficientData: true }));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));

    await waitFor(() =>
      expect(
        screen.getByText("Not enough time has passed since starting to show a comparison yet."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Symptom logs before treatment")).not.toBeInTheDocument();
  });

  it("shows an error state if the impact request fails, without crashing the page", async () => {
    impactMock.mockRejectedValue(new Error("network error"));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));

    await waitFor(() =>
      expect(screen.getByText("Couldn't load this. Try again in a moment.")).toBeInTheDocument(),
    );
  });

  it("shows the Japanese impact copy when that locale is active", async () => {
    impactMock.mockResolvedValue(populatedImpact());

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />, "ja");

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("変化を見る"));

    await waitFor(() => expect(screen.getByText("治療開始前の症状記録")).toBeInTheDocument());
    expect(screen.getByText("治療開始後の症状記録")).toBeInTheDocument();
    expect(
      screen.getByText("症状を記録した回数であり、治療の効果を示すものではありません。"),
    ).toBeInTheDocument();
  });
});

describe("Treatments page — add-treatment date validation", () => {
  // <input type="date"> only ever accepts a real ISO "YYYY-MM-DD"
  // value (anything else is silently rejected by the DOM itself), and
  // jsdom doesn't implement a real browser's segmented date-picker
  // keystroke handling, so this sets the value directly rather than
  // simulating keystrokes the way userEvent.type would for a text
  // field.
  async function fillValidNameAndDates(
    user: ReturnType<typeof userEvent.setup>,
    { startDate, endDate }: { startDate: string; endDate: string },
  ) {
    await user.type(screen.getByLabelText("Name (e.g. Estradiol patch)"), "Black cohosh");
    await user.click(screen.getByLabelText("Ongoing"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: startDate } });
    const endInput = await screen.findByLabelText("End date");
    fireEvent.change(endInput, { target: { value: endDate } });
  }

  it("rejects an end date before the start date client-side, without ever calling the API", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await fillValidNameAndDates(user, { startDate: "2026-09-18", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("End date can't be before the start date.")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("accepts an end date on or after the start date", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("End date can't be before the start date.")).not.toBeInTheDocument();
  });

  it("prefers the API's specific validation detail over the generic top-level message", async () => {
    // Simulates the one shape the client-side check above can't fully
    // rule out (see the code comment on that check) — the server is
    // still the authority, and this is what a real 400 from
    // createTreatmentSchema's refinement looks like.
    createMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Request validation failed", [
        { field: "endDate", message: "endDate cannot be before startDate" },
      ]),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("endDate cannot be before startDate")).toBeInTheDocument();
    expect(screen.queryByText("Request validation failed")).not.toBeInTheDocument();
  });

  it("falls back to the generic message when the API error carries no details", async () => {
    createMock.mockRejectedValue(new ApiError(500, "INTERNAL", "Something broke"));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });
});
