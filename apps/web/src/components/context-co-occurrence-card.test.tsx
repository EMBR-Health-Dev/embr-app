import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";

const mockContextCoOccurrence = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    trends: { contextCoOccurrence: (...args: unknown[]) => mockContextCoOccurrence(...args) },
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
  mockContextCoOccurrence.mockReset();
});

describe("ContextCoOccurrenceCard", () => {
  it("renders nothing when there is no qualifying pair yet — a common, expected case", async () => {
    mockContextCoOccurrence.mockResolvedValue(null);

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    const { container } = renderWithIntl(<ContextCoOccurrenceCard />);

    await waitFor(() => expect(mockContextCoOccurrence).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("renders nothing on an API error — fails gracefully, no error banner", async () => {
    mockContextCoOccurrence.mockRejectedValue(new Error("network down"));

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    const { container } = renderWithIntl(<ContextCoOccurrenceCard />);

    await waitFor(() => expect(mockContextCoOccurrence).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(container.textContent).toBe("");
  });

  it("renders the finding using the same evidence language as symptom co-occurrence — 'recorded alongside', never causal wording", async () => {
    mockContextCoOccurrence.mockResolvedValue({
      category: "HOT_FLASH",
      factor: "HIGH_STRESS",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(<ContextCoOccurrenceCard />);

    expect(
      await screen.findByRole("heading", { name: "Hot Flash was recorded alongside high stress" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/triggered/i)).not.toBeInTheDocument();
    // The caveat elsewhere legitimately uses "caused" in its negated
    // form ("not a claim that one caused the other") — see the
    // dedicated caveat test below for that exact wording. What must
    // never appear is an affirmative causal claim in the finding
    // heading or evidence text specifically.
    const heading = screen.getByRole("heading", {
      name: "Hot Flash was recorded alongside high stress",
    });
    expect(heading.textContent).not.toMatch(/caused/i);
  });

  it("shows the shared-days count and a visible evidence timeline, not hidden behind a disclosure", async () => {
    mockContextCoOccurrence.mockResolvedValue({
      category: "HOT_FLASH",
      factor: "CAFFEINE_AFTERNOON",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(<ContextCoOccurrenceCard />);

    expect(await screen.findByText("3 shared days")).toBeInTheDocument();
    expect(screen.getByText("Sep 1")).toBeInTheDocument();
    expect(screen.getByText("Sep 5")).toBeInTheDocument();
    expect(screen.getByText("Sep 12")).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("keeps the interpretation-boundary caveat visible, not hidden behind a disclosure", async () => {
    mockContextCoOccurrence.mockResolvedValue({
      category: "HOT_FLASH",
      factor: "ALCOHOL",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(<ContextCoOccurrenceCard />);

    await waitFor(() =>
      expect(screen.getByText(/not a diagnosis, and not a claim/i)).toBeInTheDocument(),
    );
  });

  it("shows a collapsed 'Why am I seeing this?' disclosure explaining the threshold", async () => {
    mockContextCoOccurrence.mockResolvedValue({
      category: "HOT_FLASH",
      factor: "SHORT_SLEEP",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(<ContextCoOccurrenceCard />);

    const toggle = await screen.findByText("Why am I seeing this?");
    const details = toggle.closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(
      screen.getByText(
        "EMBR surfaces a signal like this once a symptom and a context factor have been recorded together on at least 3 separate days. Hot Flash and sleep under 6 hours currently share 3 days.",
      ),
    ).toBeInTheDocument();
  });

  it("renders in Japanese too", async () => {
    mockContextCoOccurrence.mockResolvedValue({
      category: "HOT_FLASH",
      factor: "HIGH_STRESS",
      days: 3,
      dates: ["2026-09-01", "2026-09-05", "2026-09-12"],
    });

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(<ContextCoOccurrenceCard />, "ja");

    expect(
      await screen.findByRole("heading", {
        name: "ホットフラッシュは強いストレスと一緒に記録されました",
      }),
    ).toBeInTheDocument();
  });

  it("passes the from/to window through to the API call", async () => {
    mockContextCoOccurrence.mockResolvedValue(null);

    const { ContextCoOccurrenceCard } = await import("./context-co-occurrence-card");
    renderWithIntl(
      <ContextCoOccurrenceCard from="2026-01-01T00:00:00.000Z" to="2026-02-01T00:00:00.000Z" />,
    );

    await waitFor(() =>
      expect(mockContextCoOccurrence).toHaveBeenCalledWith({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-02-01T00:00:00.000Z",
      }),
    );
  });
});
