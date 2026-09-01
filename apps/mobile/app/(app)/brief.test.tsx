// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the real, documented instance API (init/changeLanguage/t); this plugin's heuristic flags every call because those same names also happen to exist as separate named exports on the module, not because this is actually a mix-up. Same false positive already suppressed in lib/i18n/plurals.test.ts. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Pressable, Text } from "react-native";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ClinicalBriefDto, Stage4Pattern } from "@embr/types";
import en from "../../locales/en.json";

const generateMock = vi.fn();
const listMock = vi.fn();
const getMock = vi.fn();
const deleteMock = vi.fn();
const trendsMock = vi.fn().mockResolvedValue({
  briefCount: 0,
  earliestBriefFromDate: null,
  latestBriefToDate: null,
  categories: [],
});
vi.mock("../../lib/api", () => ({
  api: {
    briefs: {
      generate: (...args: unknown[]) => generateMock(...args),
      list: (...args: unknown[]) => listMock(...args),
      trends: (...args: unknown[]) => trendsMock(...args),
      get: (...args: unknown[]) => getMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}));

const shareMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/brief-pdf", () => ({
  downloadAndShareBriefPdf: (...args: unknown[]) => shareMock(...args),
}));

// A file-scoped stub of the app's own DatePickerField component, not
// a new piece of shared test infrastructure — the shared native-module
// mock in test/setup.ts renders the real @react-native-community/
// datetimepicker as a no-op (see that file's own doc comment), which
// is correct for every other screen but means there is no way to
// simulate an actual date selection through it. This follows the
// exact same per-file vi.mock pattern already established just above
// for ../../lib/api, ../../lib/brief-pdf, and ../../lib/api-client
// below — a test double for one dependency this specific screen's
// tests need to control, not a new shared mechanism. Fires onChange
// with a fixed date the instant it's pressed; which date depends on
// which of the two fields this is, keyed off the real `label` prop
// each call site already passes ("From"/"To" — see brief.tsx).
vi.mock("../../components/date-picker-field", () => ({
  DatePickerField: ({ label, onChange }: { label: string; onChange: (date: Date) => void }) => {
    const date = label === "From" ? new Date(2026, 0, 1) : new Date(2026, 1, 1);
    return (
      <Pressable onPress={() => onChange(date)}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));

// brief.tsx imports ApiError from here directly (a separate module
// from ../../lib/api, already mocked above) purely for `instanceof`
// checks in its catch block. The real module top-level-imports
// token-storage.ts -> expo-secure-store, so merely importing it for
// this one dependency-free class pulls in a native chain this test
// environment can't run — verified directly (isolating the import)
// before adding this, not assumed. Only ApiError is provided; nothing
// else this file exports (API_BASE_URL, apiFetch) is used by this
// screen, so nothing else needs a stand-in here.
vi.mock("../../lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    details?: { field: string; message: string }[];

    constructor(
      status: number,
      code: string,
      message: string,
      details?: { field: string; message: string }[],
    ) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
}));

beforeAll(async () => {
  await i18next.init({
    resources: { en: { translation: en } },
    lng: "en",
    fallbackLng: "en",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  generateMock.mockReset();
  listMock.mockReset();
  getMock.mockReset();
  deleteMock.mockReset();
  shareMock.mockReset().mockResolvedValue(undefined);
  trendsMock.mockClear();
  trendsMock.mockResolvedValue({
    briefCount: 0,
    earliestBriefFromDate: null,
    latestBriefToDate: null,
    categories: [],
  });
});

// Same lightweight, local-to-this-file pattern web's own
// brief.test.tsx uses for its fixture builder — no shared
// cross-package test-fixtures module exists in this monorepo (each
// app's tests are self-contained), and a ~15-line object builder
// isn't the "substantial fixture infrastructure" worth introducing
// one for. Field-for-field the same shape as web's version.
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
    type: "frequency_increased",
    observation: "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
    interpretation: "This represents an increase in how often HOT_FLASH was reported.",
    caveat: "This reflects self-reported logging frequency only.",
    confidence: "descriptive",
    evidenceRef: { category: "HOT_FLASH" },
    ...overrides,
  };
}

const HISTORY_ITEM = {
  id: "b1",
  fromDate: "2026-01-01",
  toDate: "2026-02-01",
  createdAt: "2026-02-01T00:00:00Z",
};

function mockHistoryOf(fixture: ClinicalBriefDto) {
  listMock.mockResolvedValue({
    items: [HISTORY_ITEM],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });
  getMock.mockResolvedValue(fixture);
}

// Drives the screen through the "past briefs" expand flow rather than
// the date-picker generate flow — this is a deliberate choice, not an
// oversight: DatePickerField wraps a native module that's mocked to a
// no-op (see test/setup.ts), so nothing here exercises date selection
// itself, but toggleBrief()/api.briefs.get() is a fully independent
// code path from handleGenerate() and reaches the exact same
// BriefContent rendering logic the citation section lives in.
async function renderAndExpandBrief() {
  const { default: BriefScreen } = await import("./brief");
  render(
    <I18nextProvider i18n={i18next}>
      <BriefScreen />
    </I18nextProvider>,
  );

  const row = await screen.findByText("2026-01-01 to 2026-02-01");
  fireEvent.click(row);
}

describe("Brief screen — generation", () => {
  it("shows a validation error and never calls the API when dates are missing", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByText("Generate brief"));

    expect(
      await screen.findByText("Pick a start and end date, with the start before the end."),
    ).toBeInTheDocument();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("shows the generated brief and refreshes history and trends on success", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    generateMock.mockResolvedValue(brief({ id: "new-1", aiNarrative: "Freshly generated." }));
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    // Both fetch on mount, once each, before generation ever happens.
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(trendsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("From"));
    fireEvent.click(screen.getByText("To"));
    fireEvent.click(screen.getByText("Generate brief"));

    expect(await screen.findByText("Freshly generated.")).toBeInTheDocument();
    expect(generateMock).toHaveBeenCalledWith({ fromDate: "2026-01-01", toDate: "2026-02-01" });
    // Not just that a success state exists — that it specifically
    // triggered a real refresh of both independent data sources, per
    // handleGenerate's own await loadHistory()/await loadTrends().
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(trendsMock).toHaveBeenCalledTimes(2));
  });

  it("shows the API error message and does not show a false success state when generation fails", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const { ApiError } = await import("../../lib/api-client");
    generateMock.mockRejectedValue(new ApiError(422, "VALIDATION_ERROR", "Date range too large"));
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByText("From"));
    fireEvent.click(screen.getByText("To"));
    fireEvent.click(screen.getByText("Generate brief"));

    expect(await screen.findByText("Date range too large")).toBeInTheDocument();
    expect(screen.queryByText("Your brief is ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Freshly generated.")).not.toBeInTheDocument();
    // Only the one call — a failed generation must not have been
    // retried or somehow still triggered a history/trends refresh
    // (handleGenerate's loadHistory()/loadTrends() calls sit inside
    // the try block, after generate() succeeds — a thrown error skips
    // both entirely).
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(trendsMock).toHaveBeenCalledTimes(1);
  });
});

describe("Brief screen — renders a complete fixture", () => {
  it("renders the narrative and discussion topics for a fully-populated brief", async () => {
    mockHistoryOf(brief({ aiNarrative: "Hot flashes were logged often this period." }));

    await renderAndExpandBrief();

    await waitFor(() =>
      expect(screen.getByText("Hot flashes were logged often this period.")).toBeInTheDocument(),
    );
    expect(screen.getByText("• A question?")).toBeInTheDocument();
  });
});

describe("Brief screen — Grounded in your data (Stage 4 citations)", () => {
  it("shows the cited pattern's observation when citedPatternIds resolves against interpretation.patterns", async () => {
    mockHistoryOf(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        citedPatternIds: ["frequency_increased:HOT_FLASH"],
      }),
    );

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("Grounded in your data")).toBeInTheDocument());
    expect(
      screen.getByText(
        "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the section when citedPatternIds is null", async () => {
    mockHistoryOf(brief({ citedPatternIds: null }));

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("A narrative.")).toBeInTheDocument());
    expect(screen.queryByText("Grounded in your data")).not.toBeInTheDocument();
  });

  it("does not show the section when citedPatternIds is an empty array", async () => {
    mockHistoryOf(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        citedPatternIds: [],
      }),
    );

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("A narrative.")).toBeInTheDocument());
    expect(screen.queryByText("Grounded in your data")).not.toBeInTheDocument();
  });

  it("does not crash when interpretation itself is null alongside a null citedPatternIds", async () => {
    mockHistoryOf(brief({ interpretation: null, citedPatternIds: null }));

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("A narrative.")).toBeInTheDocument());
    expect(screen.queryByText("Grounded in your data")).not.toBeInTheDocument();
  });

  it("ignores an id that doesn't resolve to a supplied pattern, without crashing the screen", async () => {
    mockHistoryOf(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [] },
        // Structurally shouldn't happen (see brief.service.ts), but
        // the component must degrade gracefully rather than throw.
        citedPatternIds: ["treatment_window_changed:missing"],
      }),
    );

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("A narrative.")).toBeInTheDocument());
    // The section title itself still renders (citedPatternIds is
    // non-empty), but no entry does, since the one id present didn't
    // resolve — nothing crashes either way.
    expect(screen.getByText("Grounded in your data")).toBeInTheDocument();
  });

  it("still renders the valid citations when one of several ids is unresolved", async () => {
    mockHistoryOf(
      brief({
        interpretation: { interpretationVersion: "1.0", patterns: [pattern()] },
        citedPatternIds: ["frequency_increased:HOT_FLASH", "treatment_window_changed:missing"],
      }),
    );

    await renderAndExpandBrief();

    await waitFor(() =>
      expect(
        screen.getByText(
          "HOT_FLASH was reported on 6 days during the current period, compared with 4.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("renders the text of the correct cited pattern, not an unrelated one also present in interpretation", async () => {
    mockHistoryOf(
      brief({
        interpretation: {
          interpretationVersion: "1.0",
          patterns: [
            pattern({
              id: "frequency_increased:HOT_FLASH",
              observation: "HOT_FLASH observation text.",
            }),
            pattern({
              id: "frequency_decreased:FATIGUE",
              type: "frequency_decreased",
              observation: "FATIGUE observation text.",
              evidenceRef: { category: "FATIGUE" },
            }),
          ],
        },
        // Only cites the FATIGUE pattern — HOT_FLASH's text must not
        // appear even though it's a real, valid entry in
        // interpretation.patterns.
        citedPatternIds: ["frequency_decreased:FATIGUE"],
      }),
    );

    await renderAndExpandBrief();

    await waitFor(() => expect(screen.getByText("FATIGUE observation text.")).toBeInTheDocument());
    expect(screen.queryByText("HOT_FLASH observation text.")).not.toBeInTheDocument();
  });
});

describe("Brief screen — Your recent trends", () => {
  it("shows the trends section with a per-category line when the API returns data", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
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
    });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    expect(await screen.findByText("Your recent trends")).toBeInTheDocument();
    expect(screen.getByText("Across your last 3 briefs")).toBeInTheDocument();
    expect(
      screen.getByText("Hot Flash — reported in 3 of 3 briefs, marked persistent in 2."),
    ).toBeInTheDocument();
  });

  it("does not show the trends section when briefCount is 0", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    trendsMock.mockResolvedValue({
      briefCount: 0,
      earliestBriefFromDate: null,
      latestBriefToDate: null,
      categories: [],
    });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    await screen.findByText("No briefs generated yet.");
    expect(screen.queryByText("Your recent trends")).not.toBeInTheDocument();
  });
});

describe("Brief screen — severity breakdown", () => {
  it("renders the localized severity/count string for a symptom with multiple severity levels", async () => {
    mockHistoryOf(
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

    await renderAndExpandBrief();

    // Intl.ListFormat("en", { style: "narrow", type: "conjunction" })
    // over ["3 Mild", "2 Moderate", "1 Severe"] — computed directly
    // via Node before writing this assertion, not assumed.
    expect(
      await screen.findByText("Hot Flash — 6 occurrences (3 Mild, 2 Moderate, 1 Severe)"),
    ).toBeInTheDocument();
  });
});

describe("Brief screen — deterministic evidence sections", () => {
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
    mockHistoryOf(realisticBrief());

    await renderAndExpandBrief();

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
    mockHistoryOf(
      realisticBrief({
        cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 2 },
      }),
    );

    await renderAndExpandBrief();

    expect(
      await screen.findByText(
        "Not enough period-start entries in this range to compute cycle length.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Brief screen — multiple items", () => {
  it("renders every discussion topic when there is more than one", async () => {
    mockHistoryOf(
      brief({ aiDiscussionTopics: ["First question?", "Second question?", "Third question?"] }),
    );

    await renderAndExpandBrief();

    expect(await screen.findByText("• First question?")).toBeInTheDocument();
    expect(screen.getByText("• Second question?")).toBeInTheDocument();
    expect(screen.getByText("• Third question?")).toBeInTheDocument();
  });

  it("renders every category row when trends contains more than one", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
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
    });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    expect(
      await screen.findByText("Hot Flash — reported in 4 of 4 briefs, marked persistent in 3."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fatigue — reported in 2 of 4 briefs, marked persistent in 0."),
    ).toBeInTheDocument();
  });
});

describe("Brief screen — PDF / share", () => {
  it("passes the correct brief id to the share helper", async () => {
    mockHistoryOf(brief());
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    await screen.findByText("2026-01-01 to 2026-02-01");
    fireEvent.click(screen.getByText("PDF"));

    await waitFor(() => expect(shareMock).toHaveBeenCalledWith("b1"));
  });

  it("shows the in-progress label while sharing is pending, then reverts once it resolves", async () => {
    mockHistoryOf(brief());
    let resolveShare!: () => void;
    shareMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveShare = resolve;
      }),
    );
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    await screen.findByText("2026-01-01 to 2026-02-01");
    fireEvent.click(screen.getByText("PDF"));

    expect(await screen.findByText("…")).toBeInTheDocument();
    expect(screen.queryByText("PDF")).not.toBeInTheDocument();

    resolveShare();

    expect(await screen.findByText("PDF")).toBeInTheDocument();
  });
});

describe("Brief screen — deletion", () => {
  it("removes a deleted brief from the history list", async () => {
    mockHistoryOf(brief());
    deleteMock.mockResolvedValue(undefined);
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    await screen.findByText("2026-01-01 to 2026-02-01");
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("b1"));
    await waitFor(() =>
      expect(screen.queryByText("2026-01-01 to 2026-02-01")).not.toBeInTheDocument(),
    );
  });

  it("clears the expanded detail view when the currently-open brief is deleted", async () => {
    mockHistoryOf(brief({ aiNarrative: "Open detail text." }));
    deleteMock.mockResolvedValue(undefined);

    await renderAndExpandBrief();
    expect(await screen.findByText("Open detail text.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(screen.queryByText("Open detail text.")).not.toBeInTheDocument());
  });

  it("clears the just-generated section when that same brief is deleted from history", async () => {
    listMock.mockResolvedValue({
      items: [HISTORY_ITEM],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    generateMock.mockResolvedValue(brief({ id: "b1", aiNarrative: "Fresh brief text." }));
    deleteMock.mockResolvedValue(undefined);
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    await screen.findByText("2026-01-01 to 2026-02-01");
    fireEvent.click(screen.getByText("From"));
    fireEvent.click(screen.getByText("To"));
    fireEvent.click(screen.getByText("Generate brief"));
    expect(await screen.findByText("Fresh brief text.")).toBeInTheDocument();

    // Deletes via the history row's own delete control, for the same
    // id the just-generated section is showing — handleDelete's
    // `if (justGenerated?.id === id) setJustGenerated(null)` branch.
    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(screen.queryByText("Fresh brief text.")).not.toBeInTheDocument());
  });
});

describe("Brief screen — history", () => {
  it("shows an empty state when there are no past briefs", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    expect(await screen.findByText("No briefs generated yet.")).toBeInTheDocument();
  });
});

describe("Brief screen — medical disclaimer", () => {
  it("renders the same safety framing web shows, near the top of the screen", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const { default: BriefScreen } = await import("./brief");
    render(
      <I18nextProvider i18n={i18next}>
        <BriefScreen />
      </I18nextProvider>,
    );

    // Exact wording match with apps/web's Brief.description — the
    // point of this test is catching future wording drift between
    // the two platforms, not just presence.
    expect(
      await screen.findByText(
        "A summary of your tracked symptoms and cycle data, with questions you can bring to your GP. This is a data summary to help your conversation — not a diagnosis, and not medical advice.",
      ),
    ).toBeInTheDocument();
  });
});
