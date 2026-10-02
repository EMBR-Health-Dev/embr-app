import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";
import ja from "../../../../messages/ja.json";
import { toIsoDate } from "../../../lib/date-format";
import { formatHistoryDate } from "../../../lib/symptom-history-format";

const route = vi.hoisted(() => ({ category: "BRAIN_FOG" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => `/timeline/${route.category}`,
  useParams: () => ({ category: route.category }),
}));

const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

vi.mock("../../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false, logout: vi.fn() }),
}));

const symptomHistory = vi.fn();
const symptomLogsList = vi.fn();

vi.mock("../../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    trends: { symptomHistory: (...args: unknown[]) => symptomHistory(...args) },
    symptomLogs: { list: (...args: unknown[]) => symptomLogsList(...args) },
  },
}));

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function history(categories: unknown[]) {
  return {
    timeZone: "UTC",
    rangeFrom: daysAgo(13),
    rangeTo: daysAgo(0),
    today: daysAgo(0),
    rules: { notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 },
    categories,
  };
}

function brainFog(overrides: Record<string, unknown>) {
  return {
    category: "BRAIN_FOG",
    firstLoggedOn: "2026-07-14",
    lastLoggedOn: daysAgo(1),
    totalEntries: 1,
    totalDaysLogged: 1,
    daysLoggedLast7: 1,
    daysLoggedLast42: 1,
    rangeEntries: 1,
    rangeDaysLogged: 1,
    rangeSeverityDays: { MILD: 0, MODERATE: 1, SEVERE: 0 },
    notLoggedRecently: false,
    days: [{ date: daysAgo(1), maxSeverity: "MODERATE", entries: 1 }],
    ...overrides,
  };
}

async function renderPage(locale: "en" | "ja" = "en") {
  const { default: Page } = await import("./page");
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <Page />
    </NextIntlClientProvider>,
  );
}

function statValue(label: string): string {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling!.textContent!;
}

beforeEach(() => {
  route.category = "BRAIN_FOG";
  symptomHistory.mockReset();
  symptomLogsList.mockReset();
});

describe("Symptom history page", () => {
  it("scenario 1: logged yesterday shows as recent, in the calendar at its severity", async () => {
    symptomHistory.mockResolvedValue(history([brainFog({})]));
    await renderPage();

    await screen.findByText("First logged", { selector: "dt" });
    expect(statValue("Last logged")).toBe(formatHistoryDate("en", daysAgo(1)));
    expect(statValue("Recent frequency")).toBe("1 of the last 7 days");
    expect(screen.queryByText("Not logged recently")).not.toBeInTheDocument();

    const cell = screen.getByRole("button", {
      name: `${formatHistoryDate("en", daysAgo(1))}: Moderate`,
    });
    expect(cell).toHaveAttribute("data-state", "logged");
    expect(symptomHistory).toHaveBeenCalledWith(
      expect.objectContaining({ to: daysAgo(0), timeZone: expect.any(String) }),
    );
  });

  it("scenario 2: six of the last seven days reads 6 of 7", async () => {
    symptomHistory.mockResolvedValue(
      history([brainFog({ daysLoggedLast7: 6, daysLoggedLast42: 24 })]),
    );
    await renderPage();

    await screen.findByText("First logged", { selector: "dt" });
    expect(statValue("Recent frequency")).toBe("6 of the last 7 days");
    expect(statValue("42 day frequency")).toBe("24 of the last 42 days");
  });

  it("scenario 3: last logged 22 days ago shows not logged recently, with its rule", async () => {
    symptomHistory.mockResolvedValue(
      history([
        brainFog({
          lastLoggedOn: daysAgo(22),
          daysLoggedLast7: 0,
          daysLoggedLast42: 10,
          notLoggedRecently: true,
          days: [],
        }),
      ]),
    );
    await renderPage();

    expect(await screen.findByText("Not logged recently")).toBeInTheDocument();
    expect(screen.getByText("Not logged in the last 21 days.")).toBeInTheDocument();
    expect(screen.getByText(/no entry for 21 days/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/resolved|improved|gone/i);
  });

  it("scenario 4: a symptom never logged says no history recorded, not no symptoms", async () => {
    route.category = "HEADACHE";
    symptomHistory.mockResolvedValue(history([brainFog({})]));
    await renderPage();

    expect(await screen.findByText("No history recorded")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/no symptoms|no headache/i);
  });

  it("scenario 5: a blank day between two logged days stays blank and says no entry recorded", async () => {
    symptomHistory.mockResolvedValue(
      history([
        brainFog({
          days: [
            { date: daysAgo(3), maxSeverity: "SEVERE", entries: 1 },
            { date: daysAgo(1), maxSeverity: "MILD", entries: 1 },
          ],
        }),
      ]),
    );
    symptomLogsList.mockResolvedValue({
      items: [
        {
          id: "s1",
          category: "BRAIN_FOG",
          severity: "SEVERE",
          occurredAt: new Date(`${daysAgo(3)}T15:00:00`).toISOString(),
          notes: "Difficulty concentrating during afternoon meeting.",
          createdAt: "",
          updatedAt: "",
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
    const user = userEvent.setup();
    await renderPage();

    const blank = await screen.findByRole("button", {
      name: `${formatHistoryDate("en", daysAgo(2))}: no entry recorded`,
    });
    expect(blank).toHaveAttribute("data-state", "no_entry");
    // No severity fill on a blank day: it is not a zero severity.
    expect(blank.className).not.toMatch(/bg-lilac/);

    await user.click(blank);
    expect(screen.getByText("No symptom entry recorded for this day.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/no brain fog/i);
    expect(symptomLogsList).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: `${formatHistoryDate("en", daysAgo(3))}: Severe` }),
    );
    expect(
      await screen.findByText("Difficulty concentrating during afternoon meeting."),
    ).toBeInTheDocument();
    expect(symptomLogsList).toHaveBeenCalledWith(
      expect.objectContaining({ category: "BRAIN_FOG", pageSize: 100 }),
    );
  });

  it("widens the calendar to the full record from the symptom's first entry", async () => {
    symptomHistory.mockResolvedValue(history([brainFog({})]));
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: "Full record" }));
    await waitFor(() =>
      expect(symptomHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: "2026-07-14" }),
      ),
    );
  });

  it("uses the Japanese copy layer", async () => {
    symptomHistory.mockResolvedValue(
      history([brainFog({ daysLoggedLast7: 5, daysLoggedLast42: 24 })]),
    );
    await renderPage("ja");

    await screen.findByText("初回記録", { selector: "dt" });
    expect(screen.getByText("最終記録", { selector: "dt" })).toBeInTheDocument();
    expect(statValue("直近7日間の頻度")).toBe("過去7日間のうち5日");
    expect(statValue("42日間の頻度")).toBe("過去42日間のうち24日");
    const legend = screen.getByRole("list", { name: "凡例" });
    expect(within(legend).getByText("記録なし")).toBeInTheDocument();
  });
});
