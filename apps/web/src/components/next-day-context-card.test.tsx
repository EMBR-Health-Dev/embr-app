import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

const mockNextDay = vi.fn();
vi.mock("../lib/api", () => ({
  api: { trends: { nextDayContext: (...args: unknown[]) => mockNextDay(...args) } },
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockNextDay.mockReset();
});

describe("NextDayContextCard", () => {
  it("shows both counts as they are, and never a causal word", async () => {
    mockNextDay.mockResolvedValue([
      {
        factor: "SHORT_SLEEP",
        category: "BRAIN_FOG",
        afterFactorDays: 4,
        afterFactorTotal: 6,
        otherDays: 3,
        otherTotal: 20,
      },
    ]);
    const { NextDayContextCard } = await import("./next-day-context-card");
    renderWithIntl(<NextDayContextCard from="2026-08-12T00:00:00.000Z" />);

    expect(
      await screen.findByText("Brain Fog on the day after sleep under 6 hours"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recorded on 4 of 6 days after sleep under 6 hours"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Recorded on 3 of 20 days after other days you answered this"),
    ).toBeInTheDocument();
    expect(mockNextDay).toHaveBeenCalledWith({ from: "2026-08-12T00:00:00.000Z", to: undefined });

    const text = screen.getByRole("region").textContent!.toLowerCase();
    for (const word of [
      "triggers",
      "triggered",
      "caused by",
      "leads to",
      "times as often",
      "worse",
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it("renders nothing when nothing qualifies, or on an error", async () => {
    mockNextDay.mockResolvedValue([]);
    const { NextDayContextCard } = await import("./next-day-context-card");
    const empty = renderWithIntl(<NextDayContextCard />);
    await waitFor(() => expect(mockNextDay).toHaveBeenCalled());
    expect(empty.container.textContent).toBe("");
    empty.unmount();

    mockNextDay.mockImplementation(() => Promise.reject(new Error("down")));
    const errored = renderWithIntl(<NextDayContextCard />);
    await waitFor(() => expect(mockNextDay).toHaveBeenCalledTimes(2));
    expect(errored.container.textContent).toBe("");
  });
});
