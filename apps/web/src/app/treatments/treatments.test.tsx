import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { TreatmentDto, TreatmentImpactDto } from "@embr/types";
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

vi.mock("../../lib/api", () => ({
  api: {
    treatments: {
      list: (...args: unknown[]) => listMock(...args),
      impact: (...args: unknown[]) => impactMock(...args),
      create: vi.fn(),
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
    before: { logCount: 5, days: 14, categoryCounts: [], severityCounts: [] },
    after: { logCount: 2, days: 14, categoryCounts: [], severityCounts: [] },
    insufficientData: false,
    ...overrides,
  };
}

beforeEach(() => {
  listMock.mockClear();
  impactMock.mockReset();
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
    impactMock.mockResolvedValue(populatedImpact());

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

  it("shows severity and category breakdowns, before → after, when data is available", async () => {
    impactMock.mockResolvedValue(
      populatedImpact({
        before: {
          logCount: 5,
          days: 14,
          categoryCounts: [
            { category: "HOT_FLASH", count: 2 },
            { category: "BRAIN_FOG", count: 1 },
          ],
          severityCounts: [
            { severity: "MILD", count: 1 },
            { severity: "MODERATE", count: 0 },
            { severity: "SEVERE", count: 2 },
          ],
        },
        after: {
          logCount: 2,
          days: 14,
          categoryCounts: [{ category: "HOT_FLASH", count: 1 }],
          severityCounts: [
            { severity: "MILD", count: 1 },
            { severity: "MODERATE", count: 0 },
            { severity: "SEVERE", count: 0 },
          ],
        },
      }),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await waitFor(() => expect(screen.getByText("Estradiol patch")).toBeInTheDocument());
    await user.click(screen.getByText("See impact"));

    await waitFor(() => expect(screen.getByText("By severity")).toBeInTheDocument());
    expect(screen.getByText("By symptom")).toBeInTheDocument();

    // Severity: fixed MILD/MODERATE/SEVERE order, before → after.
    expect(screen.getByText("Severe")).toBeInTheDocument();
    expect(screen.getByText("2 → 0")).toBeInTheDocument();

    // Category: only categories that were actually logged, before → after.
    expect(screen.getByText("Hot Flash")).toBeInTheDocument();
    expect(screen.getByText("1 → 0")).toBeInTheDocument(); // Brain Fog dropped to 0 after
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
      expect(screen.getByText("Couldn't load this — try again in a moment.")).toBeInTheDocument(),
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
