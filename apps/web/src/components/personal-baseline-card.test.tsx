import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";

const mockBaseline = vi.fn();
vi.mock("../lib/api", () => ({
  api: { trends: { personalBaseline: (...args: unknown[]) => mockBaseline(...args) } },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const base = {
  thisWeek: { from: "2026-11-04", to: "2026-11-10" },
  minBaselineWeeks: 4,
  ruleVersion: "1.0",
};

beforeEach(() => {
  mockBaseline.mockReset();
});

describe("PersonalBaselineCard", () => {
  it("shows this week and her usual week side by side, with no verdict", async () => {
    mockBaseline.mockResolvedValue({
      ...base,
      baselineWeeks: 6,
      enoughHistory: true,
      items: [
        { category: "NIGHT_SWEATS", thisWeekDays: 5, usualWeekDays: 2 },
        { category: "HOT_FLASH", thisWeekDays: 1, usualWeekDays: 2.5 },
      ],
    });
    const { PersonalBaselineCard } = await import("./personal-baseline-card");
    renderWithIntl(<PersonalBaselineCard />);

    const row = (await screen.findByRole("rowheader", { name: "Night Sweats" })).closest("tr")!;
    expect(within(row).getByText("5 days")).toBeInTheDocument();
    expect(within(row).getByText("2 days")).toBeInTheDocument();
    const hot = screen.getByRole("rowheader", { name: "Hot Flash" }).closest("tr")!;
    expect(within(hot).getByText("1 day")).toBeInTheDocument();
    expect(within(hot).getByText("2.5 days")).toBeInTheDocument();

    const text = screen.getByRole("region").textContent!.toLowerCase();
    for (const word of ["higher", "lower", "worse", "better", "abnormal", "increase"]) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain("not a diagnosis");
  });

  it("says how many weeks are still needed before there is a usual week", async () => {
    mockBaseline.mockResolvedValue({ ...base, baselineWeeks: 2, enoughHistory: false, items: [] });
    const { PersonalBaselineCard } = await import("./personal-baseline-card");
    renderWithIntl(<PersonalBaselineCard />);
    expect(
      await screen.findByText(/once you have entries in 4 recent weeks\. So far: 2 weeks\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders in Japanese", async () => {
    mockBaseline.mockResolvedValue({
      ...base,
      baselineWeeks: 4,
      enoughHistory: true,
      items: [{ category: "FATIGUE", thisWeekDays: 3, usualWeekDays: 1.5 }],
    });
    const { PersonalBaselineCard } = await import("./personal-baseline-card");
    renderWithIntl(<PersonalBaselineCard />, "ja");
    expect(await screen.findByText("今週といつもの1週間の比較")).toBeInTheDocument();
    expect(screen.getByText("1.5日")).toBeInTheDocument();
  });

  it("renders nothing on an API error", async () => {
    mockBaseline.mockRejectedValue(new Error("network down"));
    const { PersonalBaselineCard } = await import("./personal-baseline-card");
    const { container } = renderWithIntl(<PersonalBaselineCard />);
    await waitFor(() => expect(mockBaseline).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
