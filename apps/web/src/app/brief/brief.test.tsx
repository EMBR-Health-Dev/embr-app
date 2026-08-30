import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ClinicalBriefDto, Stage4Pattern } from "@embr/types";
import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Stable object reference, not a fresh literal per render — same
// reasoning as treatments.test.tsx/dashboard.test.tsx: the page's own
// effects depend on [user], and a fresh literal would make them
// re-fire on every render.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const generateMock = vi.fn();
const listMock = vi
  .fn()
  .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
const getMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    briefs: {
      generate: (...args: unknown[]) => generateMock(...args),
      list: (...args: unknown[]) => listMock(...args),
      get: (...args: unknown[]) => getMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
      pdfUrl: (id: string) => `/api/briefs/${id}/pdf`,
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

// Only the fields each test actually varies need overriding — every
// other field is a plausible, internally-consistent default so a test
// asserting on one section doesn't have to know about every other
// one.
function brief(overrides: Partial<ClinicalBriefDto> = {}): ClinicalBriefDto {
  return {
    id: "b1",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    createdAt: "2026-02-01T00:00:00Z",
    symptomSummary: [],
    cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
    treatmentSummary: [],
    frequencyComparison: [],
    coOccurrence: null,
    treatmentImpact: [],
    persistentSymptoms: [],
    interpretation: { interpretationVersion: "1.0", patterns: [] },
    citedPatternIds: [],
    aiNarrative: "A narrative.",
    aiDiscussionTopics: ["A question?"],
    ...overrides,
  };
}

function pattern(overrides: Partial<Stage4Pattern> = {}): Stage4Pattern {
  return {
    id: "frequency_increased:HOT_FLASH",
    type: "frequency_increased" as const,
    observation: "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
    interpretation: "This represents an increase in how often HOT_FLASH was reported.",
    caveat: "This reflects self-reported logging frequency only.",
    confidence: "descriptive" as const,
    evidenceRef: { category: "HOT_FLASH" as const },
    ...overrides,
  };
}

beforeEach(() => {
  generateMock.mockReset();
  listMock.mockClear();
  listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  getMock.mockReset();
  deleteMock.mockReset();
});

describe("Brief page — generation", () => {
  it("shows a validation error and never calls the API when dates are missing", async () => {
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Pick both a start and end date.")).toBeInTheDocument();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("renders the generated brief's narrative and discussion topics on success", async () => {
    generateMock.mockResolvedValue(brief({ aiNarrative: "Hot flashes were logged often." }));
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Hot flashes were logged often.")).toBeInTheDocument();
    expect(screen.getByText("A question?")).toBeInTheDocument();
  });

  it("shows the API error message when generation fails", async () => {
    const { ApiError } = await import("../../lib/api-client");
    generateMock.mockRejectedValue(new ApiError(422, "VALIDATION_ERROR", "Date range too large"));
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Date range too large")).toBeInTheDocument();
  });
});

describe("Brief page — Grounded in your data (Stage 4 citations)", () => {
  it("shows the cited pattern's observation when citedPatternIds is non-empty and resolves", async () => {
    generateMock.mockResolvedValue(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        citedPatternIds: ["frequency_increased:HOT_FLASH"],
      }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("Grounded in your data")).toBeInTheDocument();
    expect(
      screen.getByText(
        "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
      ),
    ).toBeInTheDocument();
  });

  it("appends the association text for a co-occurrence pattern", async () => {
    generateMock.mockResolvedValue(
      brief({
        interpretation: {
          interpretationVersion: "1.0",
          patterns: [
            pattern({
              id: "co_occurrence_detected:BRAIN_FOG:HOT_FLASH",
              type: "co_occurrence_detected",
              observation: "BRAIN_FOG and HOT_FLASH were both reported during this period.",
              association: "They were both reported on the same day on 4 occasions.",
              evidenceRef: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH" },
            }),
          ],
        },
        citedPatternIds: ["co_occurrence_detected:BRAIN_FOG:HOT_FLASH"],
      }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText(
        "BRAIN_FOG and HOT_FLASH were both reported during this period. They were both reported on the same day on 4 occasions.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the section when citedPatternIds is an empty array", async () => {
    generateMock.mockResolvedValue(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        citedPatternIds: [],
      }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    await screen.findByText("A narrative.");
    expect(screen.queryByText("Grounded in your data")).not.toBeInTheDocument();
  });

  it("does not show the section when citedPatternIds is null (a brief predating this field)", async () => {
    generateMock.mockResolvedValue(brief({ citedPatternIds: null }));
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    await screen.findByText("A narrative.");
    expect(screen.queryByText("Grounded in your data")).not.toBeInTheDocument();
  });

  it("skips an id that doesn't resolve to a supplied pattern, without crashing the page", async () => {
    generateMock.mockResolvedValue(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        // Cites an id that isn't actually in interpretation.patterns —
        // structurally shouldn't happen (see brief.service.ts), but the
        // component must degrade gracefully rather than throw.
        citedPatternIds: ["frequency_increased:HOT_FLASH", "treatment_window_changed:missing"],
      }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText(
        "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Brief page — history", () => {
  it("shows an empty state when there are no past briefs", async () => {
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    expect(await screen.findByText("No briefs generated yet.")).toBeInTheDocument();
  });

  it("lists past briefs and expands one on click", async () => {
    listMock.mockResolvedValue({
      items: [
        {
          id: "b1",
          fromDate: "2026-01-01",
          toDate: "2026-02-01",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    getMock.mockResolvedValue(brief({ aiNarrative: "Past brief narrative." }));
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    const entry = await screen.findByText("2026-01-01 to 2026-02-01");
    await user.click(entry);

    expect(await screen.findByText("Past brief narrative.")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("b1");
  });

  it("removes a deleted brief from the history list", async () => {
    listMock.mockResolvedValue({
      items: [
        {
          id: "b1",
          fromDate: "2026-01-01",
          toDate: "2026-02-01",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    deleteMock.mockResolvedValue(undefined);
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    await screen.findByText("2026-01-01 to 2026-02-01");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(screen.queryByText("2026-01-01 to 2026-02-01")).not.toBeInTheDocument(),
    );
  });
});
