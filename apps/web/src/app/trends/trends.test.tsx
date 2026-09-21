import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CycleLengthTrendDto } from "@embr/types";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

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
const cycleLengthMock = vi.fn();
const coOccurrenceMock = vi.fn().mockResolvedValue(null);
const evidenceStrengthMock = vi
  .fn()
  .mockResolvedValue({ strength: "EARLY", distinctDaysLogged: 0 });

vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    trends: {
      symptomFrequency: (...args: unknown[]) => symptomFrequencyMock(...args),
      cycleLength: (...args: unknown[]) => cycleLengthMock(...args),
      coOccurrence: (...args: unknown[]) => coOccurrenceMock(...args),
      evidenceStrength: (...args: unknown[]) => evidenceStrengthMock(...args),
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

describe("Patterns page — empty states", () => {
  it("shows the new evidence-infrastructure hierarchy: title, subtitle, and every section's eyebrow plus description", async () => {
    symptomFrequencyMock.mockResolvedValue([]);
    cycleLengthMock.mockResolvedValue(emptyCycle);

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(
      await screen.findByText("See what your record is beginning to show over time."),
    ).toBeInTheDocument();
    expect(screen.getByText("Your record")).toBeInTheDocument();
    expect(screen.getByText("Reported data")).toBeInTheDocument();
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
        "Start logging to build your record. As your history grows, EMBR will organize your reported symptoms here.",
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
    cycleLengthMock.mockResolvedValue({
      lengths: [{ from: "2026-01-01", to: "2026-01-29", days: 28 }],
      averageDays: 28,
    });

    const { default: TrendsPage } = await import("./page");
    renderWithIntl(<TrendsPage />);

    expect(await screen.findByText("Hot Flash")).toBeInTheDocument();
    expect(screen.getByText("Fatigue")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01 → 2026-01-29")).toBeInTheDocument();
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
    expect(
      screen.queryByText(
        "What EMBR can surface from your record once there's enough to show a signal.",
      ),
    ).not.toBeInTheDocument();
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
      screen.getByText(
        "You're building your record. As you log more consistently, EMBR can surface stronger signals across symptoms and time.",
      ),
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
