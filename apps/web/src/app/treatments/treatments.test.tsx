import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { TreatmentDto, TreatmentImpactDto } from "@embr/types";
import { ApiError } from "../../lib/api-client";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { formatHistoryDate } from "../../lib/symptom-history-format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/treatments",
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false, logout: vi.fn() }),
}));

// A stable object reference (not a fresh literal per call) — the
// treatments page's load effect depends on [user] in its dependency
// array, and the real AuthProvider only produces a new reference when
// auth state genuinely changes. A fresh literal here would make that
// effect re-fire on every render, resetting treatmentsLoading back to
// true in a loop — see dashboard.test.tsx's identical fix and comment.
const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};

const treatment: TreatmentDto = {
  id: "t1",
  name: "Estradiol patch",
  category: "HRT",
  startDate: "2026-06-01",
  endDate: null,
  stopReason: null,
  notes: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const listMock = vi.fn().mockResolvedValue({
  items: [treatment],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
});
const impactMock = vi.fn();
const createMock = vi.fn().mockResolvedValue(treatment);
const updateMock = vi.fn();
const deleteMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    treatments: {
      list: (...args: unknown[]) => listMock(...args),
      impact: (...args: unknown[]) => impactMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
      delete: (...args: unknown[]) => deleteMock(...args),
    },
  },
}));

function renderWithIntl(ui: React.ReactElement, locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function populatedImpact(overrides: Partial<TreatmentImpactDto> = {}): TreatmentImpactDto {
  return {
    treatmentId: "t1",
    windowDays: 14,
    before: { logCount: 5, days: 14 },
    after: { logCount: 2, days: 14 },
    insufficientData: false,
    ...overrides,
  };
}

// The name shows on the timeline and in its list, so wait for either.
async function loaded() {
  await waitFor(() => expect(screen.getAllByText("Estradiol patch").length).toBeGreaterThan(0));
}

beforeEach(() => {
  deleteMock.mockClear();
  listMock.mockClear();
  impactMock.mockReset();
  createMock.mockReset().mockResolvedValue(treatment);
  updateMock.mockReset();
  listMock.mockResolvedValue({
    items: [treatment],
    page: 1,
    pageSize: 50,
    total: 1,
    totalPages: 1,
  });
});

describe("Treatments page — impact section", () => {
  it("shows the 'See impact' toggle for a treatment but nothing expanded by default", async () => {
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    expect(screen.getByText("Symptom entries before and after")).toBeInTheDocument();
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("shows a loading state while the impact request is in flight", async () => {
    let resolveImpact: (value: TreatmentImpactDto) => void = () => {};
    impactMock.mockReturnValue(
      new Promise<TreatmentImpactDto>((resolve) => {
        resolveImpact = resolve;
      }),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await user.click(screen.getByText("Symptom entries before and after"));

    await waitFor(() => expect(screen.getByText("Loading…")).toBeInTheDocument());

    resolveImpact(populatedImpact());
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it("shows before/after counts and the non-efficacy disclaimer once impact data loads", async () => {
    impactMock.mockResolvedValue(
      populatedImpact({
        before: { logCount: 5, days: 14 },
        after: { logCount: 2, days: 14 },
      }),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await user.click(screen.getByText("Symptom entries before and after"));

    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    expect(screen.getByText("Symptom logs since treatment began")).toBeInTheDocument();
    expect(screen.getByText("5 entries in 14 days")).toBeInTheDocument();
    expect(screen.getByText("2 entries in 14 days")).toBeInTheDocument();
    expect(
      screen.getByText(
        "A count of how often you logged symptoms, not a measure of whether the treatment is working.",
      ),
    ).toBeInTheDocument();

    // The toggle now hides it.
    await user.click(screen.getByText("Hide before and after"));
    expect(screen.queryByText("Symptom logs before treatment")).not.toBeInTheDocument();
  });

  it("only fetches impact once per treatment, even when toggled multiple times", async () => {
    impactMock.mockResolvedValue(populatedImpact());

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await user.click(screen.getByText("Symptom entries before and after"));
    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Hide before and after"));
    await user.click(screen.getByText("Symptom entries before and after"));

    await waitFor(() =>
      expect(screen.getByText("Symptom logs before treatment")).toBeInTheDocument(),
    );
    expect(impactMock).toHaveBeenCalledTimes(1);
  });

  it("shows a neutral message, not a claim, when there isn't enough data yet", async () => {
    impactMock.mockResolvedValue(populatedImpact({ insufficientData: true }));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await user.click(screen.getByText("Symptom entries before and after"));

    await waitFor(() =>
      expect(
        screen.getByText("Not enough time has passed since starting to show a comparison yet."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Symptom logs before treatment")).not.toBeInTheDocument();
  });

  it("shows an error state if the impact request fails, without crashing the page", async () => {
    impactMock.mockRejectedValue(new Error("network error"));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await user.click(screen.getByText("Symptom entries before and after"));

    await waitFor(() =>
      expect(screen.getByText("Couldn't load this. Try again in a moment.")).toBeInTheDocument(),
    );
  });

  it("shows the Japanese impact copy when that locale is active", async () => {
    impactMock.mockResolvedValue(populatedImpact());

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />, "ja");

    await loaded();
    await user.click(screen.getByText("開始前後の症状の記録"));

    await waitFor(() => expect(screen.getByText("治療開始前の症状記録")).toBeInTheDocument());
    expect(screen.getByText("治療開始後の症状記録")).toBeInTheDocument();
    expect(
      screen.getByText("症状を記録した回数であり、治療の効果を示すものではありません。"),
    ).toBeInTheDocument();
  });
});

describe("Treatments page — add-treatment date validation", () => {
  // <input type="date"> only ever accepts a real ISO "YYYY-MM-DD"
  // value (anything else is silently rejected by the DOM itself), and
  // jsdom doesn't implement a real browser's segmented date-picker
  // keystroke handling, so this sets the value directly rather than
  // simulating keystrokes the way userEvent.type would for a text
  // field.
  async function fillValidNameAndDates(
    user: ReturnType<typeof userEvent.setup>,
    { startDate, endDate }: { startDate: string; endDate: string },
  ) {
    await user.click(screen.getByRole("button", { name: "Add a treatment" }));
    await user.type(screen.getByLabelText("Name (e.g. Estradiol patch)"), "Black cohosh");
    await user.click(screen.getByLabelText("Ongoing"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: startDate } });
    const endInput = await screen.findByLabelText("End date");
    fireEvent.change(endInput, { target: { value: endDate } });
  }

  it("rejects an end date before the start date client-side, without ever calling the API", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await fillValidNameAndDates(user, { startDate: "2026-09-18", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("End date can't be before the start date.")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("accepts an end date on or after the start date", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("End date can't be before the start date.")).not.toBeInTheDocument();
  });

  it("prefers the API's specific validation detail over the generic top-level message", async () => {
    // Simulates the one shape the client-side check above can't fully
    // rule out (see the code comment on that check) — the server is
    // still the authority, and this is what a real 400 from
    // createTreatmentSchema's refinement looks like.
    createMock.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "Request validation failed", [
        { field: "endDate", message: "endDate cannot be before startDate" },
      ]),
    );

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("endDate cannot be before startDate")).toBeInTheDocument();
    expect(screen.queryByText("Request validation failed")).not.toBeInTheDocument();
  });

  it("falls back to the generic message when the API error carries no details", async () => {
    createMock.mockRejectedValue(new ApiError(500, "INTERNAL", "Something broke"));

    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    await loaded();
    await fillValidNameAndDates(user, { startDate: "2026-09-01", endDate: "2026-09-10" });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    expect(await screen.findByText("Something broke")).toBeInTheDocument();
  });
});

describe("Treatments page — why did you stop", () => {
  const ended: TreatmentDto = { ...treatment, endDate: "2026-07-01", stopReason: "SIDE_EFFECTS" };

  it("asks only once the treatment has an end, and sends the reason with the new treatment", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);
    await loaded();

    expect(screen.queryByLabelText("Why did you stop? (optional)")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add a treatment" }));
    await user.type(screen.getByLabelText("Name (e.g. Estradiol patch)"), "Black cohosh");
    await user.click(screen.getByLabelText("Ongoing"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-01" } });
    fireEvent.change(await screen.findByLabelText("End date"), { target: { value: "2026-09-10" } });
    const select = screen.getByLabelText("Why did you stop? (optional)") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(
      screen.getByText(
        "Your BRIEF shows the reason you pick, for your healthcare provider. Prefer not to say is never shown.",
      ),
    ).toBeInTheDocument();
    await user.selectOptions(select, "LONG_TERM_CONCERN");
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      endDate: "2026-09-10",
      stopReason: "LONG_TERM_CONCERN",
    });
  });

  it("leaves the reason out when not answered", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);
    await loaded();

    await user.click(screen.getByRole("button", { name: "Add a treatment" }));
    await user.type(screen.getByLabelText("Name (e.g. Estradiol patch)"), "Black cohosh");
    await user.click(screen.getByLabelText("Ongoing"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-01" } });
    fireEvent.change(await screen.findByLabelText("End date"), { target: { value: "2026-09-10" } });
    await user.click(screen.getByRole("button", { name: "Add treatment" }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]![0].stopReason).toBeUndefined();
  });

  it("shows and changes the reason on an ended treatment, and never on an ongoing one", async () => {
    listMock.mockResolvedValue({
      items: [ended, { ...treatment, id: "t2", name: "Magnesium" }],
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    });
    updateMock.mockResolvedValue({ ...ended, stopReason: "COST" });
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    const rowSelect = (await screen.findByLabelText(
      "Why did you stop Estradiol patch?",
    )) as HTMLSelectElement;
    expect(rowSelect.value).toBe("SIDE_EFFECTS");
    expect(screen.queryByLabelText("Why did you stop Magnesium?")).not.toBeInTheDocument();

    await user.selectOptions(rowSelect, "COST");
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("t1", { stopReason: "COST" }));
    await waitFor(() => expect(rowSelect.value).toBe("COST"));
  });

  it("clears the reason back to not answered", async () => {
    listMock.mockResolvedValue({ items: [ended], page: 1, pageSize: 50, total: 1, totalPages: 1 });
    updateMock.mockResolvedValue({ ...ended, stopReason: null });
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    const rowSelect = await screen.findByLabelText("Why did you stop Estradiol patch?");
    await user.selectOptions(rowSelect, "");
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith("t1", { stopReason: null }));
  });
});

describe("Treatments page — over time", () => {
  const ended: TreatmentDto = {
    ...treatment,
    id: "t2",
    name: "Magnesium",
    category: "SUPPLEMENT",
    startDate: "2026-03-01",
    endDate: "2026-05-15",
    stopReason: null,
  };

  beforeEach(() => {
    listMock.mockResolvedValue({
      items: [treatment, ended],
      page: 1,
      pageSize: 50,
      total: 2,
      totalPages: 1,
    });
  });

  it("puts every treatment on one timeline, earliest first, then splits current from past", async () => {
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    const timeline = await screen.findByRole("region", { name: "Over time" });
    const rows = within(timeline).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Magnesium"),
      expect.stringContaining("Estradiol patch"),
    ]);
    expect(rows[0]).toHaveTextContent(
      `${formatHistoryDate("en", "2026-03-01")} to ${formatHistoryDate("en", "2026-05-15")}`,
    );
    expect(rows[1]).toHaveTextContent(`Since ${formatHistoryDate("en", "2026-06-01")}`);

    const current = screen.getByRole("heading", { name: "Current" }).closest("section")!;
    expect(within(current).getByText("Estradiol patch")).toBeInTheDocument();
    expect(within(current).queryByText("Magnesium")).not.toBeInTheDocument();
    const past = screen.getByRole("heading", { name: "Past" }).closest("section")!;
    // 1 Mar to 15 May counts both days: 76 days, two whole months.
    expect(within(past).getByText(/2 months/)).toBeInTheDocument();
    // No raw ISO dates or dashes in the copy.
    expect(document.body).not.toHaveTextContent("2026-03-01");
    expect(document.body).not.toHaveTextContent("–");
  });

  it("records the day she actually stopped, with an optional reason, not today", async () => {
    updateMock.mockResolvedValue({ ...treatment, endDate: "2026-09-20" });
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);
    await loaded();

    await user.click(screen.getByRole("button", { name: "Mark as stopped" }));
    const panel = screen.getByRole("group", { name: "When did you stop Estradiol patch?" });
    fireEvent.change(within(panel).getByLabelText("Stopped on"), {
      target: { value: "2026-09-20" },
    });
    await user.selectOptions(
      within(panel).getByLabelText(/Why did you stop\? \(optional\)/),
      "SIDE_EFFECTS",
    );
    await user.click(within(panel).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("t1", {
        endDate: "2026-09-20",
        stopReason: "SIDE_EFFECTS",
      }),
    );
  });

  it("refuses a stop date before the start date without calling the API", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);
    await loaded();

    await user.click(screen.getByRole("button", { name: "Mark as stopped" }));
    fireEvent.change(screen.getByLabelText("Stopped on"), { target: { value: "2026-05-01" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Pick a date on or after the start date, then try again."),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("asks before deleting, and Cancel keeps the treatment", async () => {
    const user = userEvent.setup();
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);
    await loaded();

    const current = screen.getByRole("heading", { name: "Current" }).closest("section")!;
    await user.click(within(current).getByRole("button", { name: "Delete" }));
    expect(deleteMock).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", { name: /Delete Estradiol patch\?/ });
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(deleteMock).not.toHaveBeenCalled();

    await user.click(within(current).getByRole("button", { name: "Delete" }));
    await user.click(
      within(screen.getByRole("group", { name: /Delete Estradiol patch\?/ })).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("t1"));
  });

  it("opens the add form straight away when nothing is recorded yet", async () => {
    listMock.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 });
    const { default: TreatmentsPage } = await import("./page");
    renderWithIntl(<TreatmentsPage />);

    expect(await screen.findByLabelText("Name (e.g. Estradiol patch)")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Over time" })).not.toBeInTheDocument();
  });
});
