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
const trendsMock = vi.fn().mockResolvedValue({
  briefCount: 0,
  earliestBriefFromDate: null,
  latestBriefToDate: null,
  categories: [],
  longitudinalPatterns: [],
});
vi.mock("../../lib/api", () => ({
  api: {
    briefs: {
      generate: (...args: unknown[]) => generateMock(...args),
      list: (...args: unknown[]) => listMock(...args),
      trends: (...args: unknown[]) => trendsMock(...args),
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
  trendsMock.mockClear();
  trendsMock.mockResolvedValue({
    briefCount: 0,
    earliestBriefFromDate: null,
    latestBriefToDate: null,
    categories: [],
    longitudinalPatterns: [],
  });
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

describe("Brief page — Your recent trends", () => {
  it("shows the trends section with a per-category line when the API returns data", async () => {
    trendsMock.mockResolvedValue({
      briefCount: 3,
      earliestBriefFromDate: "2026-01-01",
      latestBriefToDate: "2026-03-01",
      categories: [
        {
          category: "HOT_FLASH",
          briefsPresent: 3,
          briefsPersistent: 2,
          totalBriefs: 3,
          mostRecentBriefFromDate: "2026-02-01",
          mostRecentBriefToDate: "2026-03-01",
        },
      ],
      longitudinalPatterns: [],
    });
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    expect(await screen.findByText("Your recent trends")).toBeInTheDocument();
    expect(screen.getByText("Across your last 3 briefs")).toBeInTheDocument();
    expect(
      screen.getByText("Hot Flash — reported in 3 of 3 briefs, marked persistent in 2."),
    ).toBeInTheDocument();
  });

  it("shows the recurring-across-briefs section when longitudinalPatterns is non-empty", async () => {
    trendsMock.mockResolvedValue({
      briefCount: 3,
      earliestBriefFromDate: "2026-01-01",
      latestBriefToDate: "2026-03-01",
      categories: [
        {
          category: "HOT_FLASH",
          briefsPresent: 3,
          briefsPersistent: 2,
          totalBriefs: 3,
          mostRecentBriefFromDate: "2026-02-01",
          mostRecentBriefToDate: "2026-03-01",
        },
      ],
      longitudinalPatterns: [
        {
          id: "recurring_across_briefs:HOT_FLASH",
          type: "recurring_across_briefs",
          category: "HOT_FLASH",
          observation: "HOT_FLASH was reported in every one of your last 3 briefs.",
          briefsPresent: 3,
          totalBriefs: 3,
        },
      ],
    });
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    expect(await screen.findByText("Recurring across your briefs")).toBeInTheDocument();
    expect(
      screen.getByText("Hot Flash has appeared in every one of your last 3 briefs."),
    ).toBeInTheDocument();
  });

  it("does not show the recurring-across-briefs section when longitudinalPatterns is empty", async () => {
    trendsMock.mockResolvedValue({
      briefCount: 3,
      earliestBriefFromDate: "2026-01-01",
      latestBriefToDate: "2026-03-01",
      categories: [
        {
          category: "HOT_FLASH",
          briefsPresent: 2,
          briefsPersistent: 1,
          totalBriefs: 3,
          mostRecentBriefFromDate: "2026-02-01",
          mostRecentBriefToDate: "2026-03-01",
        },
      ],
      longitudinalPatterns: [],
    });
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    expect(await screen.findByText("Your recent trends")).toBeInTheDocument();
    expect(screen.queryByText("Recurring across your briefs")).not.toBeInTheDocument();
  });

  it("does not show the trends section when briefCount is 0", async () => {
    trendsMock.mockResolvedValue({
      briefCount: 0,
      earliestBriefFromDate: null,
      latestBriefToDate: null,
      categories: [],
      longitudinalPatterns: [],
    });
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    await screen.findByText("No briefs generated yet.");
    expect(screen.queryByText("Your recent trends")).not.toBeInTheDocument();
  });
});

describe("Brief page — severity breakdown", () => {
  it("renders the localized severity/count string for a symptom with multiple severity levels", async () => {
    generateMock.mockResolvedValue(
      brief({
        symptomSummary: [
          {
            category: "HOT_FLASH",
            count: 6,
            severityBreakdown: { MILD: 3, MODERATE: 2, SEVERE: 1 },
          },
        ],
      }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    // Intl.ListFormat("en", { style: "narrow", type: "conjunction" })
    // over ["3 Mild", "2 Moderate", "1 Severe"] — computed directly
    // via Node before writing this assertion, not assumed.
    expect(
      await screen.findByText("Hot Flash — 6 occurrences (3 Mild, 2 Moderate, 1 Severe)"),
    ).toBeInTheDocument();
  });
});

describe("Brief page — deterministic evidence sections", () => {
  function realisticBrief(overrides: Partial<ClinicalBriefDto> = {}): ClinicalBriefDto {
    return brief({
      symptomSummary: [
        { category: "HOT_FLASH", count: 6, severityBreakdown: { MODERATE: 4, SEVERE: 2 } },
      ],
      frequencyComparison: [
        {
          category: "HOT_FLASH",
          currentCount: 6,
          previousCount: 4,
          absoluteChange: 2,
          percentageChange: 50,
          direction: "increased",
        },
      ],
      persistentSymptoms: ["HOT_FLASH"],
      coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
      cycleSummary: { averageCycleLengthDays: 28, cycleCount: 3, periodDaysLogged: 15 },
      treatmentSummary: [
        { name: "Estradiol patch", category: "HRT", startDate: "2026-01-10", endDate: null },
      ],
      treatmentImpact: [
        {
          treatmentId: "t1",
          name: "Estradiol patch",
          category: "HRT",
          windowDays: 14,
          before: { logCount: 2, days: 14 },
          after: { logCount: 5, days: 14 },
          insufficientData: false,
        },
        {
          treatmentId: "t2",
          name: "New medication",
          category: "MEDICATION",
          windowDays: 14,
          before: { logCount: 0, days: 14 },
          after: { logCount: 1, days: 1 },
          insufficientData: true,
        },
      ],
      ...overrides,
    });
  }

  it("renders real content for every deterministic section, including the insufficientData treatment-impact case", async () => {
    generateMock.mockResolvedValue(realisticBrief());
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(
      await screen.findByText("Hot Flash — 6 occurrences (4 Moderate, 2 Severe)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Hot Flash: Reported on 6 days, compared with 4 days in the previous period.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Hot Flash remained present across both periods.")).toBeInTheDocument();
    expect(
      screen.getByText("Brain Fog and Hot Flash were both reported on 4 days."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Average cycle length: 28 days (3 cycles recorded)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Estradiol patch — HRT, 2026-01-10 – Ongoing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Estradiol patch: 2 symptom logs in the 14 days before starting, compared with 5 symptom logs in the 14 days after.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("New medication: Not enough time has passed since starting to compare yet."),
    ).toBeInTheDocument();
  });

  it("shows the 'not enough cycle data' message when averageCycleLengthDays is null", async () => {
    generateMock.mockResolvedValue(
      realisticBrief({
        cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 2 },
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
        "Not enough period-start entries in this range to compute cycle length.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Brief page — multiple items", () => {
  it("renders every discussion topic when there is more than one", async () => {
    generateMock.mockResolvedValue(
      brief({ aiDiscussionTopics: ["First question?", "Second question?", "Third question?"] }),
    );
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(await screen.findByText("First question?")).toBeInTheDocument();
    expect(screen.getByText("Second question?")).toBeInTheDocument();
    expect(screen.getByText("Third question?")).toBeInTheDocument();
  });

  it("renders every category row when trends contains more than one", async () => {
    trendsMock.mockResolvedValue({
      briefCount: 4,
      earliestBriefFromDate: "2026-01-01",
      latestBriefToDate: "2026-04-01",
      categories: [
        {
          category: "HOT_FLASH",
          briefsPresent: 4,
          briefsPersistent: 3,
          totalBriefs: 4,
          mostRecentBriefFromDate: "2026-03-01",
          mostRecentBriefToDate: "2026-04-01",
        },
        {
          category: "FATIGUE",
          briefsPresent: 2,
          briefsPersistent: 0,
          totalBriefs: 4,
          mostRecentBriefFromDate: "2026-02-01",
          mostRecentBriefToDate: "2026-03-01",
        },
      ],
      longitudinalPatterns: [],
    });
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    expect(
      await screen.findByText("Hot Flash — reported in 4 of 4 briefs, marked persistent in 3."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fatigue — reported in 2 of 4 briefs, marked persistent in 0."),
    ).toBeInTheDocument();
  });
});

describe("Brief page — PDF download", () => {
  it("points the download link at this brief's PDF URL", async () => {
    generateMock.mockResolvedValue(brief({ id: "b-pdf-1" }));
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: /generate/i }));

    const link = await screen.findByText("Download PDF");
    expect(link).toHaveAttribute("href", "/api/briefs/b-pdf-1/pdf");
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

  it("clears the expanded detail view when the currently-open brief is deleted", async () => {
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
    getMock.mockResolvedValue(brief({ aiNarrative: "Open detail text." }));
    deleteMock.mockResolvedValue(undefined);
    const { default: BriefPage } = await import("./page");
    renderWithIntl(<BriefPage />);

    const user = userEvent.setup();
    const entry = await screen.findByText("2026-01-01 to 2026-02-01");
    await user.click(entry);
    expect(await screen.findByText("Open detail text.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Open detail text.")).not.toBeInTheDocument());
  });

  it("clears the just-generated section when that same brief is deleted from history", async () => {
    generateMock.mockResolvedValue(brief({ id: "b1", aiNarrative: "Fresh brief text." }));
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

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(await screen.findByText("Fresh brief text.")).toBeInTheDocument();

    // Deletes via the history row's own delete button, for the same
    // id the just-generated section is showing — handleDelete's
    // `if (justGenerated?.id === id) setJustGenerated(null)` branch.
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("Fresh brief text.")).not.toBeInTheDocument());
  });
});
