import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { BriefShareDto } from "@embr/types";
import messages from "../../messages/en.json";

const sharesMock = vi.fn();
const createMock = vi.fn();
const revokeMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    briefs: {
      shares: (...a: unknown[]) => sharesMock(...a),
      createShare: (...a: unknown[]) => createMock(...a),
      revokeShare: (...a: unknown[]) => revokeMock(...a),
    },
  },
}));

const { BriefShare } = await import("./brief-share");

function share(overrides: Partial<BriefShareDto> = {}): BriefShareDto {
  return {
    id: "s1",
    briefId: "b1",
    status: "ACTIVE",
    createdAt: "2026-11-01T10:00:00Z",
    expiresAt: "2026-11-08T10:00:00Z",
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
    ...overrides,
  };
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BriefShare briefId="b1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  sharesMock.mockReset().mockResolvedValue([]);
  createMock.mockReset();
  revokeMock.mockReset().mockResolvedValue(undefined);
});

describe("BriefShare", () => {
  it("creates a link for the chosen duration and shows the link, the code and a QR code once", async () => {
    createMock.mockResolvedValue({
      share: share({ expiresAt: "2026-12-01T10:00:00Z" }),
      url: "https://app.embrhealthcare.com/shared#abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      code: "042917",
    });
    renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("30 days"));
    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(createMock).toHaveBeenCalledWith("b1", 30);
    expect(await screen.findByTestId("share-code")).toHaveTextContent("042917");
    expect(screen.getByText(/\/shared#abcdefghij/)).toBeInTheDocument();
    expect(await screen.findByAltText("QR code that opens the link")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    expect(screen.getByText(/shown only now/)).toBeInTheDocument();

    // Done hides them for good: the code is never fetched again.
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("share-code")).toBeNull();
  });

  it("lists her links with their status and views, and turns an active one off", async () => {
    sharesMock
      .mockResolvedValueOnce([
        share({ id: "s1", viewCount: 2 }),
        share({ id: "s2", status: "EXPIRED" }),
      ])
      .mockResolvedValueOnce([
        share({ id: "s1", status: "REVOKED" }),
        share({ id: "s2", status: "EXPIRED" }),
      ]);
    renderCard();

    expect(await screen.findByText(/opened 2 times/)).toBeInTheDocument();
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    const turnOff = screen.getAllByRole("button", { name: "Turn off" });
    expect(turnOff).toHaveLength(1);

    await userEvent.setup().click(turnOff[0]!);
    expect(revokeMock).toHaveBeenCalledWith("b1", "s1");
    await waitFor(() => expect(screen.getByText(/Turned off/)).toBeInTheDocument());
  });

  it("shows the API's message when creating fails", async () => {
    const { ApiError } = await import("../lib/api-client");
    createMock.mockRejectedValue(
      new ApiError(409, "CONFLICT", "This brief already has 5 active links."),
    );
    renderCard();
    await userEvent.setup().click(screen.getByRole("button", { name: "Create link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has 5 active links");
  });
});
