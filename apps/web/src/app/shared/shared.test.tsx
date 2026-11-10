import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ClinicalBriefDto } from "@embr/types";
import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/shared",
}));
vi.mock("../../i18n/actions", () => ({ setLocale: vi.fn() }));

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

function brief(): ClinicalBriefDto {
  return {
    id: "b1",
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
    createdAt: "2026-10-01T00:00:00Z",
    symptomSummary: [{ category: "HOT_FLASH", count: 6, severityBreakdown: { MODERATE: 6 } }],
    cycleSummary: { averageCycleLengthDays: null, cycleCount: 0, periodDaysLogged: 0 },
    treatmentSummary: [],
    frequencyComparison: [],
    coOccurrence: null,
    treatmentImpact: [],
    persistentSymptoms: [],
    nightSweatsRecall: null,
    workImpact: null,
    socialImpact: null,
    severityTrend: null,
    exercise: null,
    mrs: null,
    lastRecordedPeriod: null,
    interpretation: { interpretationVersion: "1.0", patterns: [] },
    citedPatternIds: [],
    patientPriorities: [],
    aiNarrative: "Hot flushes were recorded on six days.",
    aiDiscussionTopics: ["Is this pattern worth discussing?"],
    aiStatus: "GENERATED",
    locale: "en",
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.location.hash = `#${TOKEN}`;
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

async function renderPage() {
  const { default: Page } = await import("./page");
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Page />
    </NextIntlClientProvider>,
  );
}

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("Shared BRIEF page (clinician, no account)", () => {
  it("asks for the code, sends token and code in the body without cookies, and shows the brief read only", async () => {
    fetchMock.mockReturnValue(
      json(200, { data: { brief: brief(), sharedUntil: "2026-11-08T10:00:00Z" } }),
    );
    await renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "042917");
    await user.click(screen.getByRole("button", { name: "Open BRIEF" }));

    expect(await screen.findByText("Hot flushes were recorded on six days.")).toBeInTheDocument();
    expect(screen.getByText(/Shared until November 8, 2026/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/shared/brief");
    expect(init).toMatchObject({ method: "POST", credentials: "omit" });
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN, code: "042917" });
    expect(String(url)).not.toContain(TOKEN);
  });

  it("does not tell the clinician to delete or recreate the BRIEF when the written summary is missing", async () => {
    fetchMock.mockReturnValue(
      json(200, {
        data: {
          brief: { ...brief(), aiStatus: "UNAVAILABLE", aiNarrative: "", aiDiscussionTopics: [] },
          sharedUntil: "2026-11-08T10:00:00Z",
        },
      }),
    );
    await renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "042917");
    await user.click(screen.getByRole("button", { name: "Open BRIEF" }));

    const notice = await screen.findByTestId("brief-ai-unavailable");
    expect(notice).toHaveTextContent("calculated directly from the patient's records");
    expect(notice).not.toHaveTextContent(/delete this BRIEF/i);
  });

  it("explains a wrong code, and an expired or turned off link, differently", async () => {
    fetchMock
      .mockReturnValueOnce(json(403, { error: { message: "x" } }))
      .mockReturnValueOnce(json(404, { error: { message: "x" } }));
    await renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "111111");
    await user.click(screen.getByRole("button", { name: "Open BRIEF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right");
    await user.click(screen.getByRole("button", { name: "Open BRIEF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
  });

  it("checks the code's format before sending anything", async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("6 digit code"), "12a3");
    await user.click(screen.getByRole("button", { name: "Open BRIEF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the 6 digit code");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the link is incomplete when it has no token", async () => {
    window.location.hash = "";
    await renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("This link is incomplete");
    expect(screen.queryByLabelText("6 digit code")).toBeNull();
  });
});
