import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { GettingStarted } from "./getting-started";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

function renderIt(props: Partial<Parameters<typeof GettingStarted>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GettingStarted
        userId="u1"
        accountCreatedAt={daysAgo(1)}
        recordStart={null}
        symptomCount={0}
        hasLifeStage={false}
        hasBrief={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => window.localStorage.clear());

describe("GettingStarted", () => {
  it("shows the checklist to a new account, linking each open step", async () => {
    renderIt();
    expect(await screen.findByRole("heading", { name: "Start here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log how you feel today" })).toHaveAttribute(
      "href",
      "/dashboard?firstLog=1",
    );
  });

  it("stays hidden once dismissed, on this browser", async () => {
    const user = userEvent.setup();
    const { unmount } = renderIt();
    await user.click(await screen.findByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("heading", { name: "Start here" })).toBeNull();
    unmount();
    renderIt();
    expect(screen.queryByRole("heading", { name: "Start here" })).toBeNull();
  });

  it("swaps to the first BRIEF nudge after a week of records", async () => {
    renderIt({ recordStart: daysAgo(8).slice(0, 10), symptomCount: 6 });
    expect(
      await screen.findByRole("heading", { name: "You have a week of records" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create my BRIEF" })).toHaveAttribute("href", "/brief");
  });
});
