import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import ja from "../../messages/ja.json";
import { toIsoDate } from "../lib/date-format";

const getCheckIn = vi.fn();
const saveCheckIn = vi.fn();
const symptomHistory = vi.fn();

vi.mock("../lib/api", () => ({
  api: {
    symptomLogs: {
      getCheckIn: (...args: unknown[]) => getCheckIn(...args),
      saveCheckIn: (...args: unknown[]) => saveCheckIn(...args),
    },
    trends: { symptomHistory: (...args: unknown[]) => symptomHistory(...args) },
  },
}));

function historyWith(categories: string[]) {
  return {
    timeZone: "UTC",
    rangeFrom: "2026-07-04",
    rangeTo: "2026-10-01",
    today: "2026-10-01",
    rules: { notLoggedRecentlyGapDays: 21, notLoggedRecentlyMinDays: 3 },
    categories: categories.map((category) => ({ category, rangeDaysLogged: 5 })),
  };
}

async function renderCheckIn(onSaved = vi.fn(), locale: "en" | "ja" = "en") {
  const { DailyCheckIn } = await import("./daily-check-in");
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <DailyCheckIn onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return onSaved;
}

const today = toIsoDate(new Date());

beforeEach(() => {
  getCheckIn.mockReset().mockResolvedValue({ date: today, entries: [] });
  saveCheckIn.mockReset();
  symptomHistory.mockReset().mockResolvedValue(historyWith([]));
});

describe("DailyCheckIn", () => {
  it("saves three symptoms with one action, each with its own severity", async () => {
    saveCheckIn.mockImplementation((_date: string, input: { entries: unknown[] }) =>
      Promise.resolve({
        date: today,
        entries: (input.entries as Array<{ category: string; severity: string }>).map((e, i) => ({
          id: `id${i}`,
          occurredAt: new Date().toISOString(),
          ...e,
        })),
      }),
    );
    const user = userEvent.setup();
    const onSaved = await renderCheckIn();

    await screen.findByRole("heading", { name: "How are you feeling today?" });
    await user.click(screen.getByRole("checkbox", { name: "Brain Fog" }));
    await user.click(screen.getByRole("checkbox", { name: "Fatigue" }));
    await user.click(screen.getByRole("checkbox", { name: "Sleep Disturbance" }));

    const save = screen.getByRole("button", { name: "Save today's check in" });
    // Severity is required once a symptom is selected: there is no default.
    expect(save).toBeDisabled();
    expect(
      screen.getByText("Choose Mild, Moderate or Severe for each selected symptom."),
    ).toBeInTheDocument();

    const pick = (symptom: string, level: string) =>
      user.click(
        within(screen.getByRole("group", { name: `Severity for ${symptom}` })).getByRole("radio", {
          name: level,
        }),
      );
    await pick("Brain Fog", "Moderate");
    await pick("Fatigue", "Severe");
    expect(save).toBeDisabled();
    await pick("Sleep Disturbance", "Mild");
    expect(save).toBeEnabled();

    await user.click(save);

    expect(saveCheckIn).toHaveBeenCalledTimes(1);
    expect(saveCheckIn).toHaveBeenCalledWith(today, {
      timeZone: expect.any(String),
      entries: [
        { category: "BRAIN_FOG", severity: "MODERATE" },
        { category: "FATIGUE", severity: "SEVERE" },
        { category: "SLEEP_DISTURBANCE", severity: "MILD" },
      ],
    });
    expect(await screen.findByRole("heading", { name: "Today's symptoms" })).toBeInTheDocument();
    expect(screen.getByText("Today's check in is saved.")).toBeInTheDocument();
    expect(screen.getByText("Brain Fog").parentElement).toHaveTextContent("Brain Fog · Moderate");
    expect(onSaved).toHaveBeenCalled();
  });

  it("only offers words for severity, never numbers, and no 'none' option", async () => {
    const user = userEvent.setup();
    await renderCheckIn();
    await user.click(await screen.findByRole("checkbox", { name: "Fatigue" }));
    const radios = screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent);
    expect(radios).toEqual(["Mild", "Moderate", "Severe"]);
    expect(screen.queryByRole("checkbox", { name: /none/i })).not.toBeInTheDocument();
  });

  it("puts recently logged symptoms first and the rest behind 'Add another symptom'", async () => {
    symptomHistory.mockResolvedValue(historyWith(["JOINT_PAIN", "HEADACHE"]));
    const user = userEvent.setup();
    await renderCheckIn();

    await waitFor(() =>
      expect(screen.getAllByRole("checkbox")[0]).toHaveAccessibleName("Joint Pain"),
    );
    expect(screen.getAllByRole("checkbox")[1]).toHaveAccessibleName("Headache");
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.queryByRole("checkbox", { name: "Vaginal Dryness" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add another symptom" }));
    expect(screen.getByRole("checkbox", { name: "Vaginal Dryness" })).toBeInTheDocument();
    // "Other" needs notes, so it stays in the single symptom form.
    expect(screen.queryByRole("checkbox", { name: "Other" })).not.toBeInTheDocument();
  });

  it("reopens a saved check in for editing and saves it to the same date", async () => {
    getCheckIn.mockResolvedValue({
      date: today,
      entries: [
        { id: "a", category: "BRAIN_FOG", severity: "MODERATE", occurredAt: "" },
        { id: "b", category: "FATIGUE", severity: "SEVERE", occurredAt: "" },
      ],
    });
    saveCheckIn.mockResolvedValue({
      date: today,
      entries: [{ id: "a", category: "BRAIN_FOG", severity: "SEVERE", occurredAt: "" }],
    });
    const user = userEvent.setup();
    await renderCheckIn();

    await screen.findByRole("heading", { name: "Today's symptoms" });
    await user.click(screen.getByRole("button", { name: "Edit today's check in" }));
    expect(screen.getByRole("checkbox", { name: "Brain Fog" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Fatigue" })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Fatigue" }));
    await user.click(
      within(screen.getByRole("group", { name: "Severity for Brain Fog" })).getByRole("radio", {
        name: "Severe",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save today's check in" }));

    expect(saveCheckIn).toHaveBeenCalledWith(today, {
      timeZone: expect.any(String),
      entries: [{ category: "BRAIN_FOG", severity: "SEVERE" }],
    });
    expect(getCheckIn).toHaveBeenCalledWith(today);
  });

  it("uses the Japanese copy layer", async () => {
    await renderCheckIn(vi.fn(), "ja");
    expect(
      await screen.findByRole("heading", { name: "今日の体調はいかがですか？" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日の記録を保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ほかの症状を追加" })).toBeInTheDocument();
  });
});
