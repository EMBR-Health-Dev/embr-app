import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { CycleLengthTrendDto } from "@embr/types";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { formatHistoryDate } from "../../lib/symptom-history-format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/trends",
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false, logout: vi.fn() }),
}));

// A stable object reference — see treatments.test.tsx's identical
// comment for why a fresh literal per render would loop this page's
// [user]-dependent data-loading effect.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

const symptomFrequencyMock = vi.fn();
// Per-symptom days, as the API returns them; empty unless a test says otherwise.
const symptomHistoryMock = vi
  .fn()
  .mockImplementation((query: { from: string; to: string }) => Promise.resolve(history(query, [])));
const cycleLengthMock = vi.fn();
const onboardingGetMock = vi.fn().mockResolvedValue({ lifeStage: null });
const coOccurrenceMock = vi.fn().mockResolvedValue(null);
const contextCoOccurrenceMock = vi.fn().mockResolvedValue(null);
const evidenceStrengthMock = vi
  .fn()
  // A record exists (outside the window under test) unless a test says
  // otherwise, so the per-section empty states render.
  .mockResolvedValue({ strength: "EARLY", distinctDaysLogged: 1 });

vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    onboarding: { get: (...args: unknown[]) => onboardingGetMock(...args) },
    trends: {
      symptomFrequency: (...args: unknown[]) => symptomFrequencyMock(...args),
      cycleLength: (...args: unknown[]) => cycleLengthMock(...args),
      coOccurrence: (...args: unknown[]) => coOccurrenceMock(...args),
      contextCoOccurrence: (...args: unknown[]) => contextCoOccurrenceMock(...args),
      evidenceStrength: (...args: unknown[]) => evidenceStrengthMock(...args),
      symptomHistory: (...args: unknown[]) => symptomHistoryMock(...args),
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

const emptyCycle: CycleLengthTrendDto = { lengths: [], averageDays: null };

function history(query: { from: string; to: string }, categories: unknown[]) {
  return {
    timeZone: "UTC",
    rangeFrom: query.from,
    rangeTo: query.to,
    today: query.to,
    rules: { notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 },
    categories,
  };
}

function isoDaysBefore(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function symptom(category: string, days: { ago: number; severity: string }[], to: string) {
  const counts = { MILD: 0, MODERATE: 0, SEVERE: 0 } as Record<string, number>;
  for (const d of days) counts[d.severity]! += 1;
  return {
    category,
    firstLoggedOn: isoDaysBefore(to, 80),
    lastLoggedOn: to,
    totalEntries: days.length + 3,
    totalDaysLogged: days.length,
    daysLoggedLast7: 0,
    daysLoggedLast42: 0,
    rangeEntries: days.length + 3,
    rangeDaysLogged: days.length,
    rangeSeverityDays: counts,
    notLoggedRecently: false,
    days: days
      .map((d) => ({ date: isoDaysBefore(to, d.ago), maxSeverity: d.severity, entries: 1 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

describe("Patterns page — empty states", () => {
  it("shows the new evidence-infrastructure hierarchy: title, subtitle, and every section's eyebrow plus description", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(
      await screen.findByText("See what your record is beginning to show over time."),
    ).toBeInTheDocument();
    // Sections render once the data has loaded; the subtitle renders before.
    expect(await screen.findByText("Your record")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content: string, el: Element | null) =>
          el?.textContent ===
            "Days you recorded each symptom in this period, on one timeline so you can see when." &&
          ![...(el?.children ?? [])].some(
            (c) =>
              c.textContent ===
              "Days you recorded each symptom in this period, on one timeline so you can see when.",
          ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cycle history")).toBeInTheDocument();
    expect(screen.getByText("Recorded cycle information.")).toBeInTheDocument();
  });

  it("shows the calm, specific empty state for symptoms — not a generic placeholder", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(await screen.findByText("No symptom entries yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your record becomes more useful as you log consistently. After several entries, this view shows how often each symptom was recorded.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the reworded cycle empty state as two separate lines, keeping the existing factual perimenopause statement verbatim", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(
      await screen.findByText(
        "Add at least two period-start dates to see your recorded cycle lengths here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Irregular or absent cycles are common in perimenopause. This is a record for you and your provider, not a diagnosis.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the same hierarchy and empty-state copy in Japanese", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />, "ja");

    expect(await screen.findByText("症状の記録はまだありません")).toBeInTheDocument();
    expect(screen.getByText("あなたの記録")).toBeInTheDocument();
    expect(screen.getByText("周期の記録")).toBeInTheDocument();
    expect(
      screen.getByText(
        "周閉経期には周期が不規則になったり、なくなったりすることはよくあります。これはあなたと担当医のための記録であり、診断ではありません。",
      ),
    ).toBeInTheDocument();
  });
});

describe("Patterns page — populated state (real data flow)", () => {
  it("still renders the symptom frequency bars and cycle length list unchanged when data exists", async () => {
    symptomFrequencyMock.mockResolvedValue([
      { category: "HOT_FLASH", count: 6 },
      { category: "FATIGUE", count: 2 },
    ]);
    symptomHistoryMock.mockImplementationOnce((query: { from: string; to: string }) =>
      Promise.resolve(
        history(query, [
          symptom("FATIGUE", [{ ago: 2, severity: "MILD" }], query.to),
          symptom(
            "HOT_FLASH",
            [
              { ago: 0, severity: "SEVERE" },
              { ago: 1, severity: "MODERATE" },
              { ago: 30, severity: "MILD" },
            ],
            query.to,
          ),
        ]),
      ),
    );
    cycleLengthMock.mockResolvedValue({
      lengths: [{ from: "2026-01-01", to: "2026-01-29", days: 28 }],
      averageDays: 28,
    });
    const user = userEvent.setup();

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    // Most recorded days first, each linking to that symptom's history.
    const hotFlash = await screen.findByRole("link", { name: "Hot Flash" });
    expect(hotFlash).toHaveAttribute("href", "/timeline/HOT_FLASH");
    const links = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href")?.startsWith("/timeline/"));
    expect(links.map((l) => l.textContent)).toEqual(["Hot Flash", "Fatigue"]);
    // Days, not entries: three days even though six entries were made.
    const hotFlashStrip = screen.getByRole("list", { name: "Hot Flash, week by week" });
    expect(hotFlashStrip.previousElementSibling).toHaveTextContent("3 days");
    // One shared axis, oldest to newest, a week per column; an
    // unrecorded week reads as no entry recorded, never no symptoms.
    const weeks = within(hotFlashStrip).getAllByRole("listitem");
    expect(weeks.length).toBe(13);
    expect(weeks.at(-1)).toHaveTextContent("recorded on 2 of 7 days, highest Severe");
    expect(weeks.at(-2)).toHaveTextContent("no entry recorded");
    expect(document.body).not.toHaveTextContent(/no symptoms/i);
    // The first row counts days with any symptom: 4 days across both.
    const anyStrip = screen.getByRole("list", { name: "Any symptom, week by week" });
    expect(anyStrip.previousElementSibling).toHaveTextContent("4 days");
    expect(screen.getByText(/Symptoms recorded on/)).toHaveTextContent(/on 4 of \d+ days/);

    // The newest week is selected: its symptoms, days and highest severity.
    const period = screen.getByRole("region", { name: /Last 7 days/ });
    expect(within(period).getByText("Hot Flash")).toBeInTheDocument();
    expect(period).toHaveTextContent("2 of 7 daysSevere");
    expect(within(period).getByText("Fatigue")).toBeInTheDocument();
    expect(within(period).getByRole("button", { name: "Later week" })).toBeDisabled();
    // One week earlier has no entry for any symptom.
    await user.click(within(period).getByRole("button", { name: "Earlier week" }));
    const earlier = screen.getByRole("region", { name: /Week of/ });
    expect(earlier).toHaveTextContent("No entry recorded this week.");
    expect(symptomHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: expect.any(String) }),
    );
    expect(
      screen.getByText(
        `${formatHistoryDate("en", "2026-01-01")} to ${formatHistoryDate("en", "2026-01-29")}`,
      ),
    ).toBeInTheDocument();
    // "28 days" legitimately appears twice with this fixture — once in
    // the averaging summary, once as the single cycle entry's own
    // value — so this checks presence, not uniqueness.
    expect(screen.getAllByText("28 days").length).toBeGreaterThan(0);
    // The new section eyebrows/descriptions render alongside real data
    // too, not just in the empty state.
    expect(screen.getByText("Your record")).toBeInTheDocument();
    expect(screen.getByText("Cycle history")).toBeInTheDocument();
    // The populated-state note is unchanged, still present.
    expect(
      screen.getByText(
        "Cycle irregularity is expected during perimenopause. This view is here to help you notice your own pattern, not to flag it as a problem.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the finding as a real sentence when a co-occurring pair exists", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);
    coOccurrenceMock.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Hot Flash and Fatigue appeared together" }),
      ).toBeInTheDocument(),
    );
    // The generic "what EMBR can surface..." explainer only shows in the
    // empty state — once a real finding exists, the finding sentence
    // itself carries that job, so the card doesn't repeat itself.
    expect(screen.queryByText("Symptoms you recorded on the same days.")).not.toBeInTheDocument();
  });
});

describe("Patterns page — evidence strength", () => {
  it("shows the Building-your-record badge with its caption when the backend reports an early record", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);
    evidenceStrengthMock.mockResolvedValue({ strength: "EARLY", distinctDaysLogged: 2 });

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(await screen.findByText("Building your record")).toBeInTheDocument();
    expect(
      screen.getByText("Your record becomes more useful as you log consistently."),
    ).toBeInTheDocument();
  });

  it("shows the Established badge once the record crosses the deterministic threshold, in Japanese too", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);
    evidenceStrengthMock.mockResolvedValue({ strength: "ESTABLISHED", distinctDaysLogged: 60 });

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />, "ja");

    expect(await screen.findByText("十分な記録が蓄積されています")).toBeInTheDocument();
    expect(
      screen.getByText("頼りになる、しっかりとした記録が集まっています。"),
    ).toBeInTheDocument();
  });
});

describe("Signals page — nothing recorded at all", () => {
  it("shows one explanation and one next step instead of empty sections", async () => {
    evidenceStrengthMock.mockResolvedValue({ strength: "EARLY", distinctDaysLogged: 0 });
    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(await screen.findByText("Nothing recorded yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log today's symptoms" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("button", { name: "Last 90 days" })).not.toBeInTheDocument();
    expect(screen.queryByText("Symptoms you recorded on the same days.")).not.toBeInTheDocument();
  });
});

describe("Patterns page — after menopause", () => {
  it("hides cycle history when she has said she is postmenopausal", async () => {
    onboardingGetMock.mockResolvedValueOnce({ lifeStage: "POSTMENOPAUSE" });
    evidenceStrengthMock.mockResolvedValue({ strength: "EARLY", distinctDaysLogged: 6 });
    symptomFrequencyMock.mockResolvedValue([{ category: "HOT_FLASH", count: 6 }]);
    cycleLengthMock.mockResolvedValue({
      lengths: [{ from: "2026-01-01", to: "2026-01-29", days: 28 }],
      averageDays: 28,
    });

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(await screen.findByText("Your record")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Cycle history")).not.toBeInTheDocument());
    expect(
      screen.queryByText(
        `${formatHistoryDate("en", "2026-01-01")} to ${formatHistoryDate("en", "2026-01-29")}`,
      ),
    ).not.toBeInTheDocument();
  });
});
