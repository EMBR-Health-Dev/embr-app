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
      screen.getByText(/EMBR needs more observations before it can surface a signal here/),
    ).toBeInTheDocument();
  });

  it("shows the generic 'what EMBR can surface' explainer only in the empty state — the finding sentence carries that job once a signal exists", async () => {
    mockCoOccurrence.mockResolvedValue(null);

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(
      await screen.findByText(
        "What EMBR can surface from your record once there's enough to show a signal.",
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

  it("renders the finding as a real sentence using real category translations, never a raw enum value", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(
      await screen.findByRole("heading", { name: "Hot Flash and Fatigue appeared together" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/HOT_FLASH/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FATIGUE/)).not.toBeInTheDocument();
  });

  it("renders the finding heading in Japanese", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "HOT_FLASH", categoryB: "FATIGUE", days: 6 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />, "ja");

    expect(
      await screen.findByRole("heading", {
        name: "ホットフラッシュと倦怠感が一緒に記録されました",
      }),
    ).toBeInTheDocument();
  });

  it("shows the shared-days count and a visual timeline of the literal evidence dates, always visible — not hidden behind a disclosure", async () => {
    mockCoOccurrence.mockResolvedValue({
      categoryA: "HOT_FLASH",
      categoryB: "FATIGUE",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(await screen.findByText("3 shared days")).toBeInTheDocument();
    expect(screen.getByText("Sep 1")).toBeInTheDocument();
    expect(screen.getByText("Sep 5")).toBeInTheDocument();
    expect(screen.getByText("Sep 12")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("pluralizes the shared-days count correctly at the singular boundary", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "ANXIETY", categoryB: "HEADACHE", days: 1 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    expect(await screen.findByText("1 shared day")).toBeInTheDocument();
  });

  it("keeps the interpretation-boundary caveat visible, not hidden behind a disclosure", async () => {
    mockCoOccurrence.mockResolvedValue({ categoryA: "ANXIETY", categoryB: "HEADACHE", days: 3 });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument());
  });

  it("separates the reported counts (Observed) from the finding/evidence using the frequency data the parent page already fetched", async () => {
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

    expect(
      await screen.findByText(
        "Hot Flash was logged 12 times in the last 90 days. Fatigue was logged 9 times.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Observed")).toBeInTheDocument();
  });

  it("shows a fixed, deterministic 'discuss with your GP' question — never AI-generated — for the detected signal", async () => {
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

  it("shows a collapsed 'Why am I seeing this?' disclosure explaining EMBR's own reasoning for surfacing the signal", async () => {
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
    // Collapsed by default — reasoning, not always-visible clutter on
    // every signal card (the evidence itself is already visible above).
    expect(details).not.toHaveAttribute("open");

    expect(
      screen.getByText(
        "EMBR surfaces a signal like this once two symptoms have been recorded together on at least 3 separate days. Hot Flash and Fatigue currently share 3 days.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the same disclosure reasoning in Japanese", async () => {
    mockCoOccurrence.mockResolvedValue({
      categoryA: "HOT_FLASH",
      categoryB: "FATIGUE",
      days: 2,
      dates: ["2026-09-01", "2026-09-05"],
    });

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    renderWithIntl(<CoOccurrenceCard />, "ja");

    expect(await screen.findByText("なぜこれが表示されているのですか?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "EMBRは、2つの症状が同じ日に3回以上記録されると、このようなシグナルを表示します。現在、ホットフラッシュと倦怠感は2日で一致しています。",
      ),
    ).toBeInTheDocument();
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
