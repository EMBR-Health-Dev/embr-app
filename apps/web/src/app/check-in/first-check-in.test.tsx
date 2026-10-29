import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { STORAGE_KEY } from "../../lib/first-check-in";
import { FirstCheckIn } from "./first-check-in";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/check-in",
}));

const fetchSpy = vi.fn();

function renderPage(locale: "en" | "ja" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ja}>
      <FirstCheckIn />
    </NextIntlClientProvider>,
  );
}

async function completeCheckIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Prepare for a healthcare conversation" }));
  await user.click(screen.getByRole("button", { name: "Hot Flash" }));
  await user.click(screen.getByRole("button", { name: "Brain Fog" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Hot Flash: Severe" }));
  await user.click(screen.getByRole("button", { name: "Hot Flash: Most days" }));
  await user.click(screen.getByRole("button", { name: "Brain Fog: Mild" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Under 6 hours" }));
  await user.click(screen.getByRole("button", { name: "See my result" }));
}

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("print", vi.fn());
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("First check in", () => {
  it("tells her on the first screen that her answers stay on this device", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "See your last two weeks in about two minutes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your answers stay on this device. None of them is sent unless you choose to save them to an account.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("EMBR describes what you report. It is not a diagnosis."),
    ).toBeInTheDocument();
  });

  it("gives a result she can read without colour, and sends nothing", async () => {
    const user = userEvent.setup();
    renderPage();
    await completeCheckIn(user);

    expect(screen.getByRole("heading", { name: "Your last two weeks" })).toBeInTheDocument();
    const body = within(screen.getByRole("region", { name: "Body" }));
    expect(body.getByText("Hot Flash")).toBeInTheDocument();
    expect(body.getByText("At its worst: Severe · How often: Most days")).toBeInTheDocument();
    const focus = within(screen.getByRole("region", { name: "Focus" }));
    expect(focus.getByText("At its worst: Mild · How often: not given")).toBeInTheDocument();
    expect(screen.getByText("Usual sleep: Under 6 hours")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "What this can and cannot tell you" }),
    ).toBeVisible();
    expect(screen.getByText(/Keep these answers for your appointment/)).toBeInTheDocument();
    const questions = within(
      screen.getByRole("region", { name: "Questions you could ask a clinician" }),
    ).getAllByRole("listitem");
    expect(questions.map((q) => q.textContent)).toEqual([
      "The symptom I noticed most often was hot flash, on most days. What might be behind it, and what could help?",
      "Could these be connected: hot flash and brain fog?",
      "What changes would mean I should come back sooner?",
    ]);
    expect(screen.getByRole("heading", { name: "When to seek urgent help" })).toBeInTheDocument();

    // No score, number or comparison anywhere on the result.
    const main = screen.getByRole("main").textContent ?? "";
    expect(main).not.toMatch(/score|out of|\d+ ?%|compared/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers early access while saving is not available, without sending her answers", async () => {
    const user = userEvent.setup();
    renderPage();
    await completeCheckIn(user);

    const link = screen.getByRole("link", { name: "Request early access" });
    expect(link).toHaveAttribute(
      "href",
      "mailto:info@embrhealthcare.com?subject=EMBR%20early%20access",
    );
    expect(link.getAttribute("href")).not.toMatch(/hot|flash|fog|severe/i);
    expect(screen.queryByRole("button", { name: /keep tracking/i })).not.toBeInTheDocument();
  });

  it("keeps her place when the page is reloaded in the same tab", async () => {
    const user = userEvent.setup();
    const first = renderPage();
    await user.click(screen.getByRole("button", { name: "Keep a better record, long term" }));
    await user.click(screen.getByRole("button", { name: "Fatigue" }));
    first.unmount();

    renderPage();
    expect(
      await screen.findByRole("heading", { name: "What have you noticed in the last two weeks?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fatigue" })).toHaveAttribute("aria-pressed", "true");
  });

  it("clears her answers from the device when she asks", async () => {
    const user = userEvent.setup();
    renderPage();
    await completeCheckIn(user);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain("HOT_FLASH");

    await user.click(screen.getByRole("button", { name: "Clear my answers" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your answers have been cleared from this device.",
    );
    expect(
      screen.getByRole("heading", { name: "See your last two weeks in about two minutes" }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY) ?? "").not.toContain("HOT_FLASH");
    expect(window.localStorage.length).toBe(0);
  });

  it("can be skipped straight through to a result", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Not sure yet" }));
    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(screen.getByRole("button", { name: "Skip and see my result" }));

    expect(
      screen.getByText("You did not pick any symptoms. That is worth knowing too."),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Questions you could ask a clinician" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(3);
  });

  it("lets her go back and change her answers", async () => {
    const user = userEvent.setup();
    renderPage();
    await completeCheckIn(user);
    await user.click(screen.getByRole("button", { name: "Change my answers" }));
    expect(screen.getByRole("button", { name: "Hot Flash" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("runs in Japanese", () => {
    renderPage("ja");
    expect(
      screen.getByRole("heading", { name: "約2分で、この2週間をふり返りましょう" }),
    ).toBeInTheDocument();
  });
});
