import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/timeline",
}));

// A stable object reference — see trends.test.tsx's identical comment
// for why a fresh literal per render would loop this page's
// [user]-dependent data-loading effect.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false, logout: vi.fn() }),
}));

const symptomLogsList = vi.fn();
const cycleEntriesList = vi.fn();
const treatmentsList = vi.fn();
const symptomHistory = vi.fn();

// The record summary's own list requests are mocked out so these tests
// keep counting only the timeline's fetches; the date helpers stay real.
vi.mock("../../lib/record-history", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/record-history")>()),
  fetchRecordSpan: vi
    .fn()
    .mockResolvedValue({ start: null, symptomCount: 0, cycleCount: 0, treatmentCount: 0 }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    symptomLogs: { list: (...args: unknown[]) => symptomLogsList(...args) },
    cycleEntries: { list: (...args: unknown[]) => cycleEntriesList(...args) },
    treatments: { list: (...args: unknown[]) => treatmentsList(...args) },
    trends: { symptomHistory: (...args: unknown[]) => symptomHistory(...args) },
  },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const emptyPage = { items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 };

beforeEach(() => {
  symptomLogsList.mockReset().mockResolvedValue(emptyPage);
  cycleEntriesList.mockReset().mockResolvedValue(emptyPage);
  treatmentsList.mockReset().mockResolvedValue(emptyPage);
  symptomHistory.mockReset().mockResolvedValue({
    timeZone: "UTC",
    rangeFrom: "2026-07-04",
    rangeTo: "2026-10-01",
    today: "2026-10-01",
    rules: { notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 },
    categories: [],
  });
});

describe("Timeline page — empty state", () => {
  it("shows the calm empty state when nothing has ever been recorded", async () => {
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    expect(await screen.findByText("Nothing recorded yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "As you log symptoms, cycle days, and treatments, they'll appear here in order, day by day.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the title, subtitle, and filter buttons", async () => {
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    // "Timeline" appears twice (the nav link and the page's own h1) —
    // scoped to the heading specifically to disambiguate.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Timeline", level: 1 })).toBeInTheDocument(),
    );
    expect(screen.getByText("Every entry in your record, in order.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Symptoms" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cycle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Treatments" })).toBeInTheDocument();
  });

  it("shows the Timeline nav link, pointing at /timeline", async () => {
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    await waitFor(() => expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument());
    const desktopNav = screen.getByTestId("app-nav-desktop");
    expect(within(desktopNav).getByRole("link", { name: "Timeline" })).toHaveAttribute(
      "href",
      "/timeline",
    );
  });
});

describe("Timeline page — populated state (real data flow)", () => {
  function makeSymptomLog(id: string, category: string, occurredAt: string) {
    return {
      id,
      category,
      severity: "MODERATE",
      occurredAt,
      notes: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  it("groups symptoms, cycle, and treatment events by date, most recent first", async () => {
    symptomLogsList.mockResolvedValue({
      ...emptyPage,
      items: [
        makeSymptomLog("s1", "HOT_FLASH", "2026-09-20T10:00:00.000Z"),
        makeSymptomLog("s2", "SLEEP_DISTURBANCE", "2026-09-20T11:00:00.000Z"),
        makeSymptomLog("s3", "HOT_FLASH", "2026-09-18T09:00:00.000Z"),
      ],
      total: 3,
    });
    cycleEntriesList.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          id: "c1",
          date: "2026-09-19",
          flow: "SPOTTING",
          isPeriodStart: false,
          isPeriodEnd: false,
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      total: 1,
    });
    treatmentsList.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          id: "t1",
          name: "Estradiol patch",
          category: "HRT",
          startDate: "2026-09-18",
          endDate: null,
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      total: 1,
    });

    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    // Sep 20: two unique categories, deduped and joined.
    expect(await screen.findByText("Hot Flash · Sleep Disturbance")).toBeInTheDocument();
    // Sep 19: cycle-only day.
    expect(screen.getByText(/Cycle:/)).toBeInTheDocument();
    // Sep 18: a symptom day that's also the treatment's start date.
    expect(screen.getByText("Started Estradiol patch")).toBeInTheDocument();

    // Most-recent-first ordering: Sep 20's heading appears before Sep 18's.
    // Day headings are level 3, under a level-2 month heading.
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    const sep20Index = headings.findIndex((h) => h?.includes("20"));
    const sep18Index = headings.findIndex((h) => h?.includes("18"));
    expect(sep20Index).toBeGreaterThanOrEqual(0);
    expect(sep18Index).toBeGreaterThan(sep20Index);
  });

  it("toggling a filter off hides that category's entries without refetching", async () => {
    const user = userEvent.setup();
    symptomLogsList.mockResolvedValue({
      ...emptyPage,
      items: [makeSymptomLog("s1", "HOT_FLASH", "2026-09-20T10:00:00.000Z")],
      total: 1,
    });

    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    expect(await screen.findByText("Hot Flash")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Symptoms" }));

    // With the only populated category filtered off, the page falls
    // back to the filtered-empty state rather than the never-recorded
    // one — a different message for a genuinely different situation.
    expect(await screen.findByText("Nothing matches this filter.")).toBeInTheDocument();
    expect(screen.queryByText("Hot Flash")).not.toBeInTheDocument();
    // No new fetch — toggling is a pure client-side filter over
    // already-loaded data.
    expect(symptomLogsList).toHaveBeenCalledTimes(1);
  });

  it("shows a truncation notice when a source has more data than the fetched page", async () => {
    symptomLogsList.mockResolvedValue({
      ...emptyPage,
      items: [makeSymptomLog("s1", "HOT_FLASH", "2026-09-20T10:00:00.000Z")],
      total: 500,
    });

    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    expect(
      await screen.findByText(
        "Showing your most recently recorded activity from the last 90 days.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the same grouped copy in Japanese", async () => {
    symptomLogsList.mockResolvedValue({
      ...emptyPage,
      items: [makeSymptomLog("s1", "HOT_FLASH", "2026-09-20T10:00:00.000Z")],
      total: 1,
    });

    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />, "ja");

    expect(await screen.findByText("ホットフラッシュ")).toBeInTheDocument();
    // "タイムライン" appears twice (the nav link and the page's own h1) —
    // scoped to the heading specifically to disambiguate.
    expect(screen.getByRole("heading", { name: "タイムライン", level: 1 })).toBeInTheDocument();
  });
});

describe("Timeline page — full record", () => {
  it("shows how far back the record goes, and 'Full record' fetches from its first entry", async () => {
    const { fetchRecordSpan } = await import("../../lib/record-history");
    vi.mocked(fetchRecordSpan).mockResolvedValueOnce({
      start: "2025-06-01",
      symptomCount: 120,
      cycleCount: 9,
      treatmentCount: 2,
    });
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    expect(await screen.findByText("Your record goes back to June 1, 2025.")).toBeInTheDocument();
    expect(
      screen.getByText("120 symptom entries, 9 cycle entries and 2 treatments so far."),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Full record" }));

    await waitFor(() =>
      expect(symptomLogsList).toHaveBeenCalledWith(
        expect.objectContaining({ from: new Date("2025-06-01T00:00:00").toISOString(), page: 1 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Full record" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("Timeline page — symptom evidence cards", () => {
  function category(overrides: Record<string, unknown>) {
    return {
      category: "BRAIN_FOG",
      firstLoggedOn: "2026-07-14",
      lastLoggedOn: "2026-10-01",
      totalEntries: 30,
      totalDaysLogged: 30,
      daysLoggedLast7: 5,
      daysLoggedLast42: 24,
      rangeEntries: 30,
      rangeDaysLogged: 30,
      rangeSeverityDays: { MILD: 10, MODERATE: 15, SEVERE: 5 },
      notLoggedRecently: false,
      days: [],
      ...overrides,
    };
  }

  it("shows what, when, how often and recently for each symptom, and links to its history", async () => {
    symptomHistory.mockResolvedValue({
      timeZone: "UTC",
      rangeFrom: "2026-07-04",
      rangeTo: "2026-10-01",
      today: "2026-10-01",
      rules: { notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 },
      categories: [
        category({}),
        category({
          category: "JOINT_PAIN",
          lastLoggedOn: "2026-09-04",
          daysLoggedLast7: 0,
          daysLoggedLast42: 6,
          notLoggedRecently: true,
        }),
      ],
    });
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    const heading = await screen.findByRole("heading", { name: "Symptom history" });
    const section = heading.closest("section")!;
    const fog = within(section).getByRole("heading", { name: "Brain Fog" }).closest("li")!;
    expect(within(fog).getByText("24 of the last 42 days")).toBeInTheDocument();
    expect(within(fog).getByText("Jul 14, 2026")).toBeInTheDocument();
    expect(within(fog).getByText("Logged on 5 of the last 7 days.")).toBeInTheDocument();
    expect(within(fog).queryByText("Not logged recently")).not.toBeInTheDocument();
    expect(within(fog).getByRole("link", { name: "View Brain Fog history" })).toHaveAttribute(
      "href",
      "/timeline/BRAIN_FOG",
    );

    const joint = within(section).getByRole("heading", { name: "Joint Pain" }).closest("li")!;
    expect(within(joint).getByText("Not logged recently")).toBeInTheDocument();
    expect(joint).toHaveTextContent("Not logged recently. Not logged in the last 21 days.");
    for (const word of [/resolved/i, /improved/i, /gone/i]) {
      expect(section).not.toHaveTextContent(word);
    }
  });

  it("shows no evidence section for an empty record", async () => {
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);
    await screen.findByText("Nothing recorded yet.");
    expect(screen.queryByRole("heading", { name: "Symptom history" })).not.toBeInTheDocument();
  });
});

describe("Timeline page — month view", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-25T12:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function seed() {
    symptomLogsList.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          id: "s1",
          category: "HOT_FLASH",
          severity: "MODERATE",
          occurredAt: "2026-09-20T10:00:00",
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      total: 1,
    });
    cycleEntriesList.mockResolvedValue({
      ...emptyPage,
      items: [
        {
          id: "c1",
          date: "2026-09-20",
          flow: "LIGHT",
          isPeriodStart: true,
          isPeriodEnd: false,
          notes: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      total: 1,
    });
  }

  it("marks days with entries, reads blank days as no entry recorded, and opens a tapped day", async () => {
    seed();
    const user = userEvent.setup();
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    await user.click(await screen.findByRole("button", { name: "Month" }));
    expect(await screen.findByRole("heading", { name: "September 2026" })).toBeInTheDocument();

    const day = screen.getByRole("button", { name: "Sep 20, 2026: Symptoms, Cycle" });
    expect(
      screen.getByRole("button", { name: "Sep 21, 2026: no entry recorded" }),
    ).toBeInTheDocument();

    await user.click(day);
    expect(day).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Hot Flash")).toBeInTheDocument();
    expect(screen.getByText("Cycle: Light · Period started")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sep 21, 2026: no entry recorded" }));
    expect(screen.getByText("No entry recorded for this day.")).toBeInTheDocument();
  });

  it("drops a kind of mark when its filter is turned off", async () => {
    seed();
    const user = userEvent.setup();
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    await user.click(await screen.findByRole("button", { name: "Month" }));
    await user.click(screen.getByRole("button", { name: "Cycle", pressed: true }));
    expect(
      await screen.findByRole("button", { name: "Sep 20, 2026: Symptoms" }),
    ).toBeInTheDocument();
  });

  it("moves between months within the loaded range", async () => {
    seed();
    const user = userEvent.setup();
    const { default: TimelinePage } = await import("./page");
    renderWithIntl(<TimelinePage />);

    await user.click(await screen.findByRole("button", { name: "Month" }));
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByRole("heading", { name: "August 2026" })).toBeInTheDocument();
  });
});
