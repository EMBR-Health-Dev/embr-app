import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReflectionDto } from "@embr/types";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";

const mockList = vi.fn();
const mockDismiss = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    reflections: {
      list: (...args: unknown[]) => mockList(...args),
      dismiss: (...args: unknown[]) => mockDismiss(...args),
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

beforeEach(() => {
  mockList.mockReset();
  mockDismiss.mockReset();
});

describe("ReflectionsSection", () => {
  it("renders nothing while the request is in flight", async () => {
    let resolveList!: (value: ReflectionDto[]) => void;
    mockList.mockReturnValue(new Promise((resolve) => (resolveList = resolve)));

    const { ReflectionsSection } = await import("./reflections-section");
    const { container } = renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(container.textContent).toBe("");
    resolveList([]);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
  });

  it("renders nothing when there are no reflections", async () => {
    mockList.mockResolvedValue([]);

    const { ReflectionsSection } = await import("./reflections-section");
    const { container } = renderWithIntl(<ReflectionsSection refreshKey={0} />);

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("renders nothing on an API error — fails quietly, no error banner", async () => {
    mockList.mockRejectedValue(new Error("network down"));

    const { ReflectionsSection } = await import("./reflections-section");
    const { container } = renderWithIntl(<ReflectionsSection refreshKey={0} />);

    await waitFor(() => expect(mockList).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("renders the LOGGING_ACTIVITY reflection's actual heading and message text", async () => {
    mockList.mockResolvedValue([
      {
        type: "LOGGING_ACTIVITY",
        key: "k1",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        logCount: 3,
        daysLogged: 1,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(await screen.findByText("Your week so far")).toBeInTheDocument();
    // The exact bug this composed-t() pattern fixed: 3 logs on 1 day
    // must not silently borrow logCount's plural form for daysLogged.
    expect(screen.getByText("You've logged 3 times, across 1 day.")).toBeInTheDocument();
  });

  it("renders the SYMPTOM_FREQUENCY reflection with a real category translation, not a raw enum", async () => {
    mockList.mockResolvedValue([
      {
        type: "SYMPTOM_FREQUENCY",
        key: "k2",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "HOT_FLASH",
        count: 4,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(await screen.findByText("What stood out this week")).toBeInTheDocument();
    expect(
      screen.getByText("Hot Flash was your most frequently logged symptom, on 4 days."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HOT_FLASH/)).not.toBeInTheDocument();
  });

  it("renders the SYMPTOM_CO_OCCURRENCE reflection with its message and caveat", async () => {
    mockList.mockResolvedValue([
      {
        type: "SYMPTOM_CO_OCCURRENCE",
        key: "k3",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        categoryA: "ANXIETY",
        categoryB: "HEADACHE",
        days: 2,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(await screen.findByText("Something you may want to notice")).toBeInTheDocument();
    expect(
      screen.getByText("You logged Anxiety and Headache on the same 2 days."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This is a record of what you logged, not a medical conclusion."),
    ).toBeInTheDocument();
  });

  it("renders the TREATMENT_CONTEXT reflection with its message and non-efficacy caveat", async () => {
    mockList.mockResolvedValue([
      {
        type: "TREATMENT_CONTEXT",
        key: "k4",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        treatmentId: "t1",
        treatmentName: "Estradiol patch",
        treatmentCategory: "HRT",
        logCount: 2,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(await screen.findByText("Since starting Estradiol patch")).toBeInTheDocument();
    expect(
      screen.getByText("You've logged 2 symptom entries during this period."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A count of what you've logged during this treatment — not a measure of how well it's working.",
      ),
    ).toBeInTheDocument();
  });

  it("renders all four reflection types together when the API returns all of them", async () => {
    mockList.mockResolvedValue([
      {
        type: "LOGGING_ACTIVITY",
        key: "k1",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        logCount: 3,
        daysLogged: 2,
      },
      {
        type: "SYMPTOM_FREQUENCY",
        key: "k2",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "FATIGUE",
        count: 5,
      },
      {
        type: "SYMPTOM_CO_OCCURRENCE",
        key: "k3",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        categoryA: "ANXIETY",
        categoryB: "HEADACHE",
        days: 1,
      },
      {
        type: "TREATMENT_CONTEXT",
        key: "k4",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        treatmentId: "t1",
        treatmentName: "HRT patch",
        treatmentCategory: "HRT",
        logCount: 1,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    expect(await screen.findByText("Your week so far")).toBeInTheDocument();
    expect(screen.getByText("What stood out this week")).toBeInTheDocument();
    expect(screen.getByText("Something you may want to notice")).toBeInTheDocument();
    expect(screen.getByText("Since starting HRT patch")).toBeInTheDocument();
  });

  it("renders the Japanese translation for a reflection", async () => {
    mockList.mockResolvedValue([
      {
        type: "SYMPTOM_FREQUENCY",
        key: "k1",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "HOT_FLASH",
        count: 4,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />, "ja");

    expect(await screen.findByText("今週目立ったこと")).toBeInTheDocument();
    expect(
      screen.getByText("ホットフラッシュが今週最も多く記録された症状でした（4日）。"),
    ).toBeInTheDocument();
  });

  it("optimistically removes a dismissed reflection and calls the dismiss endpoint with its type and key", async () => {
    mockList.mockResolvedValue([
      {
        type: "SYMPTOM_FREQUENCY",
        key: "k1",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "HOT_FLASH",
        count: 4,
      },
    ] satisfies ReflectionDto[]);
    mockDismiss.mockResolvedValue(undefined);

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    await screen.findByText("What stood out this week");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    // Removed from the screen immediately, before the dismiss call
    // even resolves — this is the "optimistic" part.
    expect(screen.queryByText("What stood out this week")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockDismiss).toHaveBeenCalledWith({ type: "SYMPTOM_FREQUENCY", key: "k1" }),
    );
  });

  it("rolls back an optimistic dismissal if the server call fails", async () => {
    mockList.mockResolvedValue([
      {
        type: "SYMPTOM_FREQUENCY",
        key: "k1",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "HOT_FLASH",
        count: 4,
      },
    ] satisfies ReflectionDto[]);
    mockDismiss.mockRejectedValue(new Error("network down"));

    const { ReflectionsSection } = await import("./reflections-section");
    renderWithIntl(<ReflectionsSection refreshKey={0} />);

    await screen.findByText("What stood out this week");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(mockDismiss).toHaveBeenCalled());
    // Didn't stick server-side, so it's back — the meaningful
    // guarantee is the end state, not the precise instant it briefly
    // disappeared (too fast/timing-dependent to assert reliably here,
    // and already covered structurally by the success-case test's
    // "removed before the call resolves" assertion above).
    expect(await screen.findByText("What stood out this week")).toBeInTheDocument();
  });

  it("re-fetches when refreshKey changes", async () => {
    mockList.mockResolvedValue([]);

    const { ReflectionsSection } = await import("./reflections-section");
    const { rerender } = renderWithIntl(<ReflectionsSection refreshKey={0} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReflectionsSection refreshKey={1} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it("still fetches fresh data if refreshKey changes while the initial fetch is in flight, rather than silently dropping it", async () => {
    // The exact sequence this regression guards: (1) an initial fetch
    // is in flight, (2) a log is submitted successfully, (3) the
    // dashboard bumps refreshKey, (4) the original fetch then
    // resolves. Confirmed by tracing it directly (not assumed) that
    // an earlier version of this guard — skip if already in flight,
    // nothing more — silently dropped this refresh forever: the
    // skipped effect registered no cleanup, and the in-flight fetch's
    // own `cancelled` flag was already true (flipped by the
    // refreshKey change's cleanup) by the time it resolved, so its
    // result was discarded with nothing left to ever fetch again in
    // that session.
    let resolveFirst!: (value: ReflectionDto[]) => void;
    mockList.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    mockList.mockResolvedValueOnce([
      {
        type: "SYMPTOM_FREQUENCY",
        key: "fresh",
        periodStart: "2026-01-01",
        periodEnd: "2026-01-07",
        category: "HOT_FLASH",
        count: 1,
      },
    ] satisfies ReflectionDto[]);

    const { ReflectionsSection } = await import("./reflections-section");
    const { rerender } = renderWithIntl(<ReflectionsSection refreshKey={0} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    // A successful log submission bumps refreshKey while the first
    // fetch is still pending.
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReflectionsSection refreshKey={1} />
      </NextIntlClientProvider>,
    );
    // Not issued immediately — the in-flight guard correctly holds
    // off on a duplicate, concurrent request.
    expect(mockList).toHaveBeenCalledTimes(1);

    // The original (now-stale) fetch resolves.
    resolveFirst([]);

    // The skipped refresh must still happen — a second request for
    // the fresh data, and its result must actually render, not be
    // silently discarded.
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("What stood out this week")).toBeInTheDocument();
  });

  it("does not issue a second, overlapping request while one is already in flight", async () => {
    let resolveFirst!: (value: ReflectionDto[]) => void;
    mockList.mockReturnValue(new Promise((resolve) => (resolveFirst = resolve)));

    const { ReflectionsSection } = await import("./reflections-section");
    const { rerender } = renderWithIntl(<ReflectionsSection refreshKey={0} />);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));

    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ReflectionsSection refreshKey={1} />
      </NextIntlClientProvider>,
    );
    expect(mockList).toHaveBeenCalledTimes(1);

    resolveFirst([]);
    // Once the pending refetch this queues completes, no further,
    // unrequested calls should follow.
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});
