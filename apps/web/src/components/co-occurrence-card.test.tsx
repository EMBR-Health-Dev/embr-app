import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";

const mockCoOccurrence = vi.fn();
vi.mock("../lib/api", () => ({
  api: { trends: { coOccurrence: (...args: unknown[]) => mockCoOccurrence(...args) } },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockCoOccurrence.mockReset();
});

describe("CoOccurrenceCard", () => {
  it("shows a loading skeleton while the request is in flight", async () => {
    let resolveRequest!: (value: null) => void;
    mockCoOccurrence.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)));

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    const { container } = renderWithIntl(<CoOccurrenceCard />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRequest(null);
    await waitFor(() => expect(mockCoOccurrence).toHaveBeenCalled());
  });

  it("shows an elegant empty state — not a blank card, not an error — when no pair has qualified yet", async () => {
    mockCoOccurrence.mockResolvedValue(null);

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(mockCoOccurrence).toHaveBeenCalled());
    expect(await screen.findByText("Your record is still taking shape.")).toBeInTheDocument();
    expect(
      screen.getByText(/EMBR needs more observations before it can surface a recurring pattern/),
    ).toBeInTheDocument();
  });

  it("shows the persistent section description in both the empty and populated states", async () => {
    mockCoOccurrence.mockResolvedValue(null);

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(
      await screen.findByText(
        "What EMBR can surface from your record once there's enough to show a pattern.",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing on an API error — fails gracefully, no error banner", async () => {
    mockCoOccurrence.mockRejectedValue(new Error("network down"));

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    const { container } = renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(mockCoOccurrence).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(container.textContent).toBe("");
  });

  it("renders the translated insight in English using real category translations, never a raw enum value", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(screen.getByText(/appeared alongside/i)).toBeInTheDocument());
    expect(screen.getByText("Hot Flash appeared alongside Fatigue on 6 days.")).toBeInTheDocument();
    expect(screen.queryByText(/HOT_FLASH/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FATIGUE/)).not.toBeInTheDocument();
  });

  it("renders the translated insight in Japanese", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />, "ja");

    expect(
      await screen.findByText("ホットフラッシュは倦怠感とともに、6日記録されています。"),
    ).toBeInTheDocument();
  });

  it("pluralizes the day count correctly at the singular boundary", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "ANXIETY", categoryB: "HEADACHE", days: 1 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(screen.getByText(/on 1 day\./)).toBeInTheDocument());
  });

  it("includes the non-diagnostic caveat text alongside the insight", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "ANXIETY", categoryB: "HEADACHE", days: 3 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument());
  });

  it("separates the reported counts (Observed) from the co-occurrence finding (Pattern) using the frequency data the parent page already fetched", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(
      <CoOccurrenceCard
        frequency={[
          { category: "HOT_FLASH", count: 12 },
          { category: "FATIGUE", count: 9 },
        ]}
        windowDays={90}
      />,
    );

    // Observed: a plain reported-count fact, distinct from the
    // Pattern section's own co-occurrence-day count above.
    expect(
      await screen.findByText(
        "Hot Flash was logged 12 times in the last 90 days. Fatigue was logged 9 times.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Observed")).toBeInTheDocument();
  });

  it("shows a fixed, deterministic 'discuss with your GP' question — never AI-generated — for the detected pattern", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(
      await screen.findByText(
        "Is it common for Hot Flash and Fatigue to occur together at this stage?",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Discuss with your GP")).toBeInTheDocument();
    expect(screen.getByText("A suggested question, not medical advice.")).toBeInTheDocument();
  });

  it("shows the Observed and Discuss-with-your-GP layers in Japanese too", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(
      <CoOccurrenceCard frequency={[{ category: "HOT_FLASH", count: 12 }]} windowDays={90} />,
      "ja",
    );

    expect(
      await screen.findByText(
        "ホットフラッシュは過去90日間で12回記録されました。倦怠感は0回記録されました。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("この時期にホットフラッシュと倦怠感が一緒に起こるのはよくあることですか？"),
    ).toBeInTheDocument();
  });

  it("shows a collapsed 'Why am I seeing this?' disclosure with the literal evidence dates, when the backend provides them", async () => {
    mockCoOccurrence.mockResolvedValue({
      categoryA: "HOT_FLASH",
      categoryB: "FATIGUE",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    const toggle = await screen.findByText("Why am I seeing this?");
    const details = toggle.closest("details");
    expect(details).not.toBeNull();
    // Collapsed by default — this is a disclosure, not always-visible
    // clutter on every pattern card.
    expect(details).not.toHaveAttribute("open");

    expect(screen.getByText("Both were logged on these days:")).toBeInTheDocument();
    expect(screen.getByText("Sep 1, Sep 5, Sep 12")).toBeInTheDocument();
  });

  it("shows no 'Why am I seeing this?' disclosure when the backend doesn't provide dates", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(screen.getByText(/appeared alongside/i)).toBeInTheDocument());
    expect(screen.queryByText("Why am I seeing this?")).not.toBeInTheDocument();
  });

  it("shows the same evidence disclosure in Japanese", async () => {
    mockCoOccurrence.mockResolvedValue({
      categoryA: "HOT_FLASH",
      categoryB: "FATIGUE",
      days: 2,
      dates: ["2026-09-01", "2026-09-05"],
    });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />, "ja");

    expect(await screen.findByText("なぜこれが表示されているのですか?")).toBeInTheDocument();
    expect(screen.getByText("両方が記録された日:")).toBeInTheDocument();
    expect(screen.getByText("9月1日, 9月5日")).toBeInTheDocument();
  });

  it("passes the from/to window through to the API call", async () => {
    mockCoOccurrence.mockResolvedValue(null);

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(
      <CoOccurrenceCard from="2026-01-01T00:00:00.000Z" to="2026-02-01T00:00:00.000Z" />,
    );

    await waitFor(() =>
      expect(mockCoOccurrence).toHaveBeenCalledWith({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z",
      }),
    );
  });
});
