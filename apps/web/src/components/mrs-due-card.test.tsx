import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";

const list = vi.fn();
vi.mock("../lib/api", () => ({
  api: { mrsCheckIns: { list: (...a: unknown[]) => list(...a) } },
}));

async function renderCard() {
  const { MrsDueCard } = await import("./mrs-due-card");
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MrsDueCard />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.resetModules();
  list.mockReset();
  process.env.NEXT_PUBLIC_MRS_CHECK_IN_ENABLED = "true";
});

describe("MrsDueCard", () => {
  it("invites her when she has never rated", async () => {
    list.mockResolvedValue([]);
    await renderCard();
    expect(await screen.findByRole("link", { name: "Start the rating" })).toHaveAttribute(
      "href",
      "/monthly-rating",
    );
  });

  it("stays hidden when a rating was done recently", async () => {
    const today = new Date().toISOString().slice(0, 10);
    list.mockResolvedValue([{ completedOn: today }]);
    const { container } = await renderCard();
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing at all while switched off", async () => {
    process.env.NEXT_PUBLIC_MRS_CHECK_IN_ENABLED = "false";
    const { container } = await renderCard();
    expect(list).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
