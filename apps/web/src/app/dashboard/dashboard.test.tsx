import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
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
const symptomLogsList = vi
  .fn()
  .mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
const symptomLogsCreate = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    symptomLogs: { list: symptomLogsList, create: symptomLogsCreate },
    onboarding: { get: vi.fn().mockResolvedValue({ jobToBeDone: null }) },
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    trends: { symptomFrequency },
    reflections: { list: vi.fn().mockResolvedValue([]), dismiss: vi.fn() },
    briefs: { list: vi.fn().mockResolvedValue({ items: [] }) },
  },
}));

beforeEach(() => {
  symptomFrequency.mockReset().mockResolvedValue([]);
  symptomLogsList
    .mockReset()
    .mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 });
  symptomLogsCreate.mockReset();
});

function makeLog(id: string, category = "HOT_FLASH") {
  return {
    id,
    category,
    severity: "MODERATE",
    occurredAt: "2026-01-01T00:00:00Z",
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

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
    // Scoped to the desktop nav variant specifically: AppNav renders both
    // a desktop row and a mobile menu with the same links (only one is
    // visually shown at a time via a CSS breakpoint, which jsdom doesn't
    // evaluate), so an unscoped query would match each link twice.
    const desktopNav = screen.getByTestId("app-nav-desktop");
    expect(within(desktopNav).getByRole("link", { name: "Patterns" })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "Clinical Brief" })).toBeInTheDocument();
    expect(screen.getByText("Today's cycle entry")).toBeInTheDocument();
    expect(screen.getByText("Having a hot flash right now?")).toBeInTheDocument();
  });

  it("renders Japanese nav and section headers when that locale is active", async () => {
    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />, "ja");

    await waitFor(() => expect(screen.getByText("最近の症状")).toBeInTheDocument());
    const desktopNav = screen.getByTestId("app-nav-desktop");
    expect(within(desktopNav).getByRole("link", { name: "パターン" })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: "設定" })).toBeInTheDocument();
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

describe("Dashboard — hot-flash quick-log duplicate-submission guard", () => {
  it("disables the button while a log is in flight and ignores a second tap before the first resolves", async () => {
    const user = userEvent.setup();
    let resolveCreate!: () => void;
    symptomLogsCreate.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    const button = await screen.findByRole("button", {
      name: "Log a hot flash happening right now",
    });

    await user.click(button);
    expect(button).toBeDisabled();

    // A second tap while the first request is still in flight must not
    // issue a second create call — there's no server-side idempotency
    // guard for symptom logs, so this button is the only thing
    // standing between a double-tap and two duplicate records.
    await user.click(button);
    expect(symptomLogsCreate).toHaveBeenCalledTimes(1);

    resolveCreate();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});

describe("Dashboard — symptom log form error handling", () => {
  it("shows a real error message next to the form, and keeps it open, when the API call fails", async () => {
    const user = userEvent.setup();
    symptomLogsCreate.mockRejectedValue(new Error("network down"));

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Log a different symptom")).toBeInTheDocument());
    await user.click(screen.getByText("Log a different symptom"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Previously this failure was swallowed entirely — no error, no
    // feedback, the form just sat there having silently done nothing.
    expect(
      await screen.findByText("Couldn't save that. Check your connection and try again."),
    ).toBeInTheDocument();
    // The form must still be open and usable, not collapsed as if the
    // (failed) submission had succeeded.
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});

describe("Dashboard — recent symptoms pagination", () => {
  it("does not show Load more when everything already fits on one page", async () => {
    symptomLogsList.mockResolvedValue({
      items: [makeLog("1")],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    await waitFor(() => expect(screen.getByText("Recent symptoms")).toBeInTheDocument());
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("fetches and appends the next page from the server, rather than hiding items already in memory", async () => {
    const user = userEvent.setup();
    symptomLogsList.mockResolvedValueOnce({
      items: [makeLog("1", "HOT_FLASH")],
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 2,
    });

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    const loadMore = await screen.findByText("Load more");
    symptomLogsList.mockResolvedValueOnce({
      items: [makeLog("2", "BRAIN_FOG")],
      page: 2,
      pageSize: 10,
      total: 2,
      totalPages: 2,
    });

    await user.click(loadMore);

    // The second page's item must come from a real second server call
    // (page: 2), not from data client-side pagination would already
    // have had in memory.
    expect(symptomLogsList).toHaveBeenLastCalledWith({ page: 2, pageSize: 10 });
    await waitFor(() => expect(screen.getByText("Brain Fog")).toBeInTheDocument());
    // The first page's item is still there — appended, not replaced.
    expect(screen.getByText("Hot Flash")).toBeInTheDocument();
    // Both pages now fetched, so the button is gone.
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("shows a real error and keeps the button usable when loading more fails", async () => {
    const user = userEvent.setup();
    symptomLogsList.mockResolvedValueOnce({
      items: [makeLog("1")],
      page: 1,
      pageSize: 10,
      total: 2,
      totalPages: 2,
    });

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    const loadMore = await screen.findByText("Load more");
    symptomLogsList.mockRejectedValueOnce(new Error("network down"));

    await user.click(loadMore);

    expect(await screen.findByText("Couldn't load more entries. Try again.")).toBeInTheDocument();
    // Still there to retry — not stuck disabled or removed.
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("resets back to the first page after logging something new", async () => {
    const user = userEvent.setup();
    symptomLogsList.mockResolvedValue({
      items: [makeLog("1")],
      page: 1,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
    symptomLogsCreate.mockResolvedValue(makeLog("new"));

    const { default: DashboardPage } = await import("./page");
    renderWithIntl(<DashboardPage />);

    const button = await screen.findByRole("button", {
      name: "Log a hot flash happening right now",
    });
    await user.click(button);

    await waitFor(() =>
      expect(symptomLogsList).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 }),
    );
  });
});
