import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { toIsoDate } from "../lib/date-format";
import { WeekOnTrack } from "./week-on-track";

const symptomList = vi.fn();
const contextList = vi.fn();
const cycleList = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    symptomLogs: { list: (...a: unknown[]) => symptomList(...a) },
    contextLogs: { list: (...a: unknown[]) => contextList(...a) },
    cycleEntries: { list: (...a: unknown[]) => cycleList(...a) },
  },
}));

function page<T>(items: T[]) {
  return { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 };
}

function renderWeek(props: Partial<React.ComponentProps<typeof WeekOnTrack>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WeekOnTrack
        refreshKey={0}
        postmenopause={false}
        appointmentSoon={false}
        latestBriefCreatedAt={null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  symptomList.mockReset().mockResolvedValue(page([{ occurredAt: now.toISOString() }]));
  contextList.mockReset().mockResolvedValue(page([{ date: toIsoDate(yesterday) }]));
  cycleList.mockReset().mockResolvedValue(page([]));
});

describe("WeekOnTrack", () => {
  it("shows seven days, how many were recorded, and today's list", async () => {
    renderWeek();

    expect(await screen.findByText("Your week")).toBeInTheDocument();
    expect(screen.getByText("2 of 7 days recorded")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(7);

    const checkIn = screen.getByRole("link", { name: /Check in: how are you feeling\?/ });
    expect(checkIn).toHaveAttribute("href", "#check-in");
    expect(within(checkIn).getByText("done")).toBeInTheDocument();

    const context = screen.getByRole("link", { name: /Add today's context/ });
    expect(within(context).getByText("not done yet")).toBeInTheDocument();
    expect(screen.getByText("Only if it applies")).toBeInTheDocument();
    expect(screen.queryByText("Create your BRIEF before your appointment")).not.toBeInTheDocument();
    expect(
      screen.getByText("A minute a day keeps your record complete for your BRIEF."),
    ).toBeInTheDocument();
  });

  it("asks only about bleeding after menopause, and adds the BRIEF step before an appointment", async () => {
    renderWeek({ postmenopause: true, appointmentSoon: true });

    expect(
      await screen.findByText("Bleeding or spotting, only if you had any"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cycle entry/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create your BRIEF/ })).toHaveAttribute(
      "href",
      "/brief",
    );
  });

  it("says today is done once the required steps are recorded", async () => {
    contextList.mockResolvedValue(page([{ date: toIsoDate(new Date()) }]));
    renderWeek();

    expect(await screen.findByText("Today is recorded. Nothing else to do.")).toBeInTheDocument();
  });

  it("stays hidden if the week cannot be loaded", async () => {
    symptomList.mockRejectedValue(new Error("offline"));
    const { container } = renderWeek();
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
