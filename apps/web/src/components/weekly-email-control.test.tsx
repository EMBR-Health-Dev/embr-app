import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { WeeklyEmailControl } from "./weekly-email-control";

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    notifications: {
      get: (...a: unknown[]) => getMock(...a),
      patch: (...a: unknown[]) => patchMock(...a),
    },
  },
}));

function renderControl() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WeeklyEmailControl />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  getMock.mockReset();
  patchMock.mockReset();
});

describe("WeeklyEmailControl", () => {
  it("is off until she turns it on, then says when the next one comes", async () => {
    getMock.mockResolvedValue({ weeklyEmail: false });
    patchMock.mockResolvedValue({ weeklyEmail: true });
    const user = userEvent.setup();
    renderControl();

    const box = await screen.findByLabelText("Send me a weekly email");
    expect(box).not.toBeChecked();
    await user.click(box);

    expect(patchMock).toHaveBeenCalledWith({ weeklyEmail: true });
    expect(await screen.findByText("On. The next one comes on Sunday.")).toBeInTheDocument();
    expect(screen.getByLabelText("Send me a weekly email")).toBeChecked();
  });

  it("turns it off", async () => {
    getMock.mockResolvedValue({ weeklyEmail: true });
    patchMock.mockResolvedValue({ weeklyEmail: false });
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByLabelText("Send me a weekly email"));
    expect(patchMock).toHaveBeenCalledWith({ weeklyEmail: false });
    expect(screen.getByLabelText("Send me a weekly email")).not.toBeChecked();
  });

  it("says when saving failed", async () => {
    getMock.mockResolvedValue({ weeklyEmail: false });
    patchMock.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderControl();

    await user.click(await screen.findByLabelText("Send me a weekly email"));
    expect(await screen.findByText("Could not save. Please try again.")).toBeInTheDocument();
  });
});
