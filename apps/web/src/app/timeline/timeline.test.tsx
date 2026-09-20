import { describe, expect, it, vi, beforeEach } from "vitest";
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

vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    symptomLogs: { list: (...args: unknown[]) => symptomLogsList(...args) },
    cycleEntries: { list: (...args: unknown[]) => cycleEntriesList(...args) },
    treatments: { list: (...args: unknown[]) => treatmentsList(...args) },
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
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
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
