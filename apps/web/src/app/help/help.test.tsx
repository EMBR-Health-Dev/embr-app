import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import ja from "../../../messages/ja.json";

const searchParams = { current: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/help",
  useSearchParams: () => searchParams.current,
}));
vi.mock("../../i18n/actions", () => ({ setLocale: vi.fn() }));
const auth = { user: null as null | { email: string } };
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: auth.user,
    loading: false,
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  searchParams.current = new URLSearchParams();
  auth.user = null;
});
afterEach(() => vi.unstubAllGlobals());

function respond(status: number) {
  return Promise.resolve(new Response(JSON.stringify({}), { status }));
}

async function renderPage(locale: "en" | "ja" = "en") {
  const { default: HelpPage } = await import("./page");
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? messages : ja}>
      <HelpPage />
    </NextIntlClientProvider>,
  );
}

async function fillAndSend(user: ReturnType<typeof userEvent.setup>, email = "maya@example.com") {
  await user.type(
    screen.getByLabelText("Your message"),
    "The PDF button does nothing on my phone.",
  );
  const emailField = screen.getByLabelText("Your email, so we can reply");
  await user.clear(emailField);
  await user.type(emailField, email);
  await user.click(screen.getByRole("button", { name: "Send message" }));
}

describe("Help page", () => {
  it("answers common questions, pointing at where each thing is done, without signing in", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
    const question = screen.getByText("I can't sign in");
    const answer = question.closest("details")!;
    expect(within(answer).getByRole("link", { name: "Reset password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByText("When to seek urgent help")).toBeInTheDocument();
  });

  it("asks for no health details before the message box, and says it is not for emergencies", async () => {
    await renderPage();
    expect(screen.getByText(/don't include health details/)).toBeInTheDocument();
    expect(screen.getByText(/not for medical questions or emergencies/)).toBeInTheDocument();
  });

  it("sends the message with the page she came from, without cookies, and confirms only after the server does", async () => {
    searchParams.current = new URLSearchParams("from=/brief");
    fetchMock.mockReturnValue(respond(202));
    const user = userEvent.setup();
    await renderPage();
    await user.selectOptions(screen.getByLabelText("What is it about?"), "BRIEF");
    await fillAndSend(user);

    expect(
      await screen.findByText(
        "Thank you. Your message was sent, and we'll reply to maya@example.com.",
      ),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/support/messages");
    expect(init).toMatchObject({ method: "POST", credentials: "omit" });
    expect(JSON.parse(init.body)).toEqual({
      topic: "BRIEF",
      message: "The PDF button does nothing on my phone.",
      replyEmail: "maya@example.com",
      page: "/brief",
      platform: "web",
    });
  });

  it("never passes on a from value that is not a plain path", async () => {
    searchParams.current = new URLSearchParams("from=/brief?from=2026-01-01");
    fetchMock.mockReturnValue(respond(202));
    const user = userEvent.setup();
    await renderPage();
    await fillAndSend(user);
    await screen.findByRole("status");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).page).toBeUndefined();
  });

  it("gives the plain email address when the message could not be sent, or after too many", async () => {
    fetchMock.mockReturnValueOnce(respond(503)).mockReturnValueOnce(respond(429));
    const user = userEvent.setup();
    await renderPage();
    await fillAndSend(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your message could not be sent. Please email us at info@embrhealthcare.com instead.",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("try again in an hour");
  });

  it("fills in her email when she is signed in", async () => {
    auth.user = { email: "signed.in@example.com" };
    await renderPage();
    expect(screen.getByLabelText("Your email, so we can reply")).toHaveValue(
      "signed.in@example.com",
    );
  });

  it("renders in Japanese", async () => {
    await renderPage("ja");
    expect(screen.getByRole("heading", { level: 1, name: "ヘルプ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送信する" })).toBeInTheDocument();
  });
});
