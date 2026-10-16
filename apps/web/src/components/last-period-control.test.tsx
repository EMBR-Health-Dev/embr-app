import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { LastPeriodControl } from "./last-period-control";

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    onboarding: {
      get: (...a: unknown[]) => getMock(...a),
      patch: (...a: unknown[]) => patchMock(...a),
    },
  },
}));

function profile(lastPeriodDate: string | null) {
  return {
    jobToBeDone: null,
    noticedAreas: [],
    appointmentStatus: null,
    lifeStage: null,
    lastPeriodDate,
    currentStep: null,
    skipped: false,
    completedAt: null,
  };
}

function renderControl() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LastPeriodControl />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

describe("LastPeriodControl", () => {
  it("saves the date she enters", async () => {
    getMock.mockResolvedValue(profile(null));
    patchMock.mockResolvedValue(profile("2025-04-20"));
    const user = userEvent.setup();
    renderControl();

    const input = await screen.findByLabelText("Date of your last period");
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    fireEvent.change(input, { target: { value: "2025-04-20" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(patchMock).toHaveBeenCalledWith({ lastPeriodDate: "2025-04-20" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows the saved date and removes it", async () => {
    getMock.mockResolvedValue(profile("2024-11-03"));
    patchMock.mockResolvedValue(profile(null));
    const user = userEvent.setup();
    renderControl();

    expect(await screen.findByLabelText("Date of your last period")).toHaveValue("2024-11-03");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(patchMock).toHaveBeenCalledWith({ lastPeriodDate: null });
    expect(await screen.findByText("Removed")).toBeInTheDocument();
    expect(screen.getByLabelText("Date of your last period")).toHaveValue("");
  });

  it("says when saving failed", async () => {
    getMock.mockResolvedValue(profile(null));
    patchMock.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderControl();

    fireEvent.change(await screen.findByLabelText("Date of your last period"), {
      target: { value: "2025-04-20" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Could not save. Please try again.")).toBeInTheDocument();
  });
});
