import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// A stable object reference (not a fresh literal per call) — several
// effects in the component depend on [user] in their dependency
// array, matching how the real AuthProvider only produces a new user
// reference when auth state genuinely changes, not on every render.
// A fresh literal here would make those effects re-fire on every
// render, which happens to be invisible for effects whose mocked data
// never changes call-to-call, but breaks any test asserting on data
// that's set once and shouldn't be overwritten by a later stray call.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

const symptomFrequency = vi.fn().mockResolvedValue([]);
const organizationsMine = vi.fn().mockResolvedValue([]);

vi.mock("../../lib/api", () => ({
  api: {
    symptomLogs: { list: vi.fn().mockResolvedValue({ items: [] }) },
    onboarding: { get: vi.fn().mockResolvedValue({ jobToBeDone: null }) },
    organizations: { mine: (...args: unknown[]) => organizationsMine(...args) },
    trends: { symptomFrequency },
  },
}));

beforeEach(() => {
  symptomFrequency.mockReset().mockResolvedValue([]);
  organizationsMine.mockReset().mockResolvedValue([]);
});

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Dashboard — translation", () => {
  it("renders English nav and section headers by default", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    expect(screen.getByText("Trends")).toBeInTheDocument();
    expect(screen.getByText("BRIEF")).toBeInTheDocument();
    expect(screen.getByText("Today's cycle entry")).toBeInTheDocument();
    expect(screen.getByText("Having a hot flash right now?")).toBeInTheDocument();
  });

  it("renders Japanese nav and section headers when that locale is active", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />, "ja");

    await waitFor(() => expect(screen.getByText("最近の症状")).toBeInTheDocument());
    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(screen.getByText("今日の周期記録")).toBeInTheDocument();
    expect(screen.getByText("今、ホットフラッシュが起きていますか?")).toBeInTheDocument();
  });

  it("translates symptom category options in the log form", async () => {
    const user = userEvent.setup();
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Log a different symptom")).toBeInTheDocument());
    await user.click(screen.getByText("Log a different symptom"));

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Hot Flash" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: "Brain Fog" })).toBeInTheDocument();
  });
});

describe("Dashboard — organization navigation", () => {
  it("shows the Organization link for a user with an organization membership", async () => {
    organizationsMine.mockResolvedValue([
      {
        organizationId: "org-1",
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    expect(await screen.findByRole("link", { name: "Organization" })).toBeInTheDocument();
  });

  it("does not show the Organization link for a user with no organization membership", async () => {
    organizationsMine.mockResolvedValue([]);
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    // organizations.mine() resolves asynchronously — wait for it to
    // settle before asserting absence, so this isn't just catching the
    // link mid-fetch rather than genuinely never appearing.
    await waitFor(() => expect(organizationsMine).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Organization" })).not.toBeInTheDocument();
  });

  it("shows the link for a plain ORG_MEMBER, not just ORG_ADMIN", async () => {
    organizationsMine.mockResolvedValue([
      {
        organizationId: "org-1",
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    // The regression this guards against: the link used to be gated on
    // role === "ORG_ADMIN" specifically. A membership list containing
    // only an ORG_MEMBER row (no ORG_ADMIN at all) must still show it.
    expect(await screen.findByRole("link", { name: "Organization" })).toBeInTheDocument();
  });
});

describe("Dashboard — weekly reflection", () => {
  it("shows nothing when there's no data logged this week", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    expect(screen.queryByText(/logs? this week/)).not.toBeInTheDocument();
  });

  it("shows the log count and most common category once weekly data exists", async () => {
    symptomFrequency.mockResolvedValueOnce([
      { category: "HOT_FLASH", count: 3 },
      { category: "BRAIN_FOG", count: 1 },
    ]);

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    // Rendered as three sibling text nodes inside one <p> ("4 logs this
    // week", " · ", "Most common: Hot Flash"), so the element's own
    // matchable text is the full concatenation, not each piece alone.
    await waitFor(() =>
      expect(screen.getByText("4 logs this week · Most common: Hot Flash")).toBeInTheDocument(),
    );
  });

  it("shows the Japanese reflection copy when that locale is active", async () => {
    symptomFrequency.mockResolvedValueOnce([{ category: "HOT_FLASH", count: 1 }]);

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />, "ja");

    await waitFor(() =>
      expect(
        screen.getByText("今週の記録: 1件 · 最も多い症状: ホットフラッシュ"),
      ).toBeInTheDocument(),
    );
  });
});
