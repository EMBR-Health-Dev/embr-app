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

  it("renders nothing when there is no qualifying pattern — not an empty card, no card at all", async () => {
    mockCoOccurrence.mockResolvedValue(null);

    const { CoOccurrenceCard } = await import("./co-occurrence-card");
    const { container } = renderWithIntl(<CoOccurrenceCard />);

    await waitFor(() => expect(mockCoOccurrence).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(container.textContent).toBe("");
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

    await waitFor(() => expect(screen.getByText(/ホットフラッシュ/)).toBeInTheDocument());
    expect(
      screen.getByText("ホットフラッシュは倦怠感とともに、6日記録されています。"),
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
