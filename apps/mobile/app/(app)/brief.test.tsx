// @vitest-environment jsdom
/* eslint-disable import/no-named-as-default-member -- i18next's default export is the real, documented instance API (init/changeLanguage/t); this plugin's heuristic flags every call because those same names also happen to exist as separate named exports on the module, not because this is actually a mix-up. Same false positive already suppressed in lib/i18n/plurals.test.ts. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ClinicalBriefDto, Stage4Pattern } from "@embr/types";
import en from "../../locales/en.json";

const listMock = vi.fn();
const getMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    briefs: {
      generate: vi.fn(),
      list: (...args: unknown[]) => listMock(...args),
      get: (...args: unknown[]) => getMock(...args),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../../lib/brief-pdf", () => ({
  downloadAndShareBriefPdf: vi.fn(),
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
  listMock.mockReset();
  getMock.mockReset();
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
