import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SymptomHistoryCategoryDto } from "@embr/types";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { SymptomRankingBars } from "./symptom-ranking-bars";

function category(category: string, rangeDaysLogged: number): SymptomHistoryCategoryDto {
  return {
    category,
    firstLoggedOn: "2026-07-01",
    lastLoggedOn: "2026-09-30",
    totalEntries: rangeDaysLogged,
    totalDaysLogged: rangeDaysLogged,
    daysLoggedLast7: 0,
    daysLoggedLast42: 0,
    rangeEntries: rangeDaysLogged,
    rangeDaysLogged,
    rangeSeverityDays: { MILD: 0, MODERATE: rangeDaysLogged, SEVERE: 0 },
    notLoggedRecently: false,
    days: [],
  } as SymptomHistoryCategoryDto;
}

function renderBars(categories: SymptomHistoryCategoryDto[], locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <SymptomRankingBars categories={categories} rangeFrom="Jul 3" rangeTo="Sep 30" />
    </NextIntlClientProvider>,
  );
}

describe("SymptomRankingBars", () => {
  it("ranks by days logged, longest first, sized against the top symptom", () => {
    renderBars([category("BRAIN_FOG", 10), category("HOT_FLASH", 20), category("FATIGUE", 5)]);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Hot Flash: 20 days",
      "Brain Fog: 10 days",
      "Fatigue: 5 days",
    ]);
    expect(screen.getByTestId("ranking-bar-HOT_FLASH").style.width).toBe("100%");
    expect(screen.getByTestId("ranking-bar-BRAIN_FOG").style.width).toBe("50%");
    expect(screen.getByTestId("ranking-bar-FATIGUE").style.width).toBe("25%");
  });

  it("shows at most five bars and leaves out symptoms with no days in range", () => {
    renderBars([
      ...["HOT_FLASH", "NIGHT_SWEATS", "FATIGUE", "BRAIN_FOG", "ANXIETY", "JOINT_PAIN"].map(
        (c, i) => category(c, 10 - i),
      ),
      category("HEADACHE", 0),
    ]);
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByTestId("ranking-bar-JOINT_PAIN")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ranking-bar-HEADACHE")).not.toBeInTheDocument();
  });

  it("renders nothing when no symptom was logged in range", () => {
    const { container } = renderBars([category("HOT_FLASH", 0)]);
    expect(container).toBeEmptyDOMElement();
  });

  it("says a day without an entry is not a day without symptoms, and uses one day singular", () => {
    renderBars([category("HOT_FLASH", 1)]);
    expect(screen.getByText(/not counted as a day without symptoms/)).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("renders in Japanese", () => {
    renderBars([category("HOT_FLASH", 3)], "ja");
    expect(screen.getByText("記録の多い症状")).toBeInTheDocument();
    expect(screen.getByText("3日")).toBeInTheDocument();
  });
});
