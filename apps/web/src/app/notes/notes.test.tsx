import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/notes",
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "person@example.test", emailVerified: true },
    loading: false,
    logout: vi.fn(),
  }),
}));

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    organizations: { mine: vi.fn().mockResolvedValue([]) },
    notes: {
      list: (...a: unknown[]) => list(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => remove(...a),
    },
  },
}));

function note(
  id: string,
  title: string,
  cover = "LILAC",
  body = "",
  updatedAt = "2026-10-02T08:00:00Z",
) {
  return { id, title, body, cover, createdAt: "2026-10-01T08:00:00Z", updatedAt };
}
const page = (items: unknown[]) => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  totalPages: 1,
});

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NotesPageUnderTest />
    </NextIntlClientProvider>,
  );
}
let NotesPageUnderTest: React.ComponentType;

beforeEach(async () => {
  list.mockReset();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  NotesPageUnderTest = (await import("./page")).default;
});

describe("Notes page", () => {
  it("says the notes stay private and are never sent to AI, and shows an empty shelf", async () => {
    list.mockResolvedValue(page([]));
    renderPage();
    expect(
      screen.getByText(/never reads them for the BRIEF or sends them to AI/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument();
  });

  it("lists each note with its title", async () => {
    list.mockResolvedValue(
      page([note("n1", "Questions for Dr Sato"), note("n2", "Sleep diary", "PLUM")]),
    );
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Open Questions for Dr Sato" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Sleep diary" })).toBeInTheDocument();
  });

  it("creates a notebook with a title, cover and text", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(page([]));
    create.mockResolvedValue(note("n9", "Appointment", "ROSE", "Ask about sleep"));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New note" }));
    await user.type(screen.getByLabelText("Title"), "Appointment");
    await user.click(screen.getByRole("radio", { name: "Rose" }));
    await user.type(screen.getByLabelText("Notes"), "Ask about sleep");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        title: "Appointment",
        body: "Ask about sleep",
        cover: "ROSE",
      }),
    );
    expect(await screen.findByRole("button", { name: "Open Appointment" })).toBeInTheDocument();
  });

  it("asks for a title instead of saving an untitled notebook", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(page([]));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "New note" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give this note a title.");
    expect(create).not.toHaveBeenCalled();
  });

  it("opens, edits and saves an existing notebook", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(page([note("n1", "Sleep diary", "LILAC", "Mon: woke twice")]));
    update.mockResolvedValue(
      note("n1", "Sleep diary", "LILAC", "Mon: woke twice\nTue: slept through"),
    );
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Open Sleep diary" }));
    const editor = screen.getByRole("region", { name: "Notebook page" });
    expect(within(editor).getByLabelText("Notes")).toHaveValue("Mon: woke twice");
    await user.type(within(editor).getByLabelText("Notes"), "\nTue: slept through");
    await user.click(within(editor).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("n1", {
        title: "Sleep diary",
        body: "Mon: woke twice\nTue: slept through",
        cover: "LILAC",
      }),
    );
  });

  it("lists notes newest edit first, grouped by month, with the opening of each", async () => {
    list.mockResolvedValue(
      page([
        note("n1", "September thoughts", "LILAC", "Hot flashes  at\nnight", "2026-09-20T08:00:00Z"),
        note("n2", "Questions for Dr Sato", "PLUM", "Ask about patches", "2026-10-12T08:00:00Z"),
        note("n3", "Empty page", "ICE", "", "2026-10-05T08:00:00Z"),
      ]),
    );
    renderPage();

    const october = await screen.findByRole("region", { name: "October 2026" });
    const september = screen.getByRole("region", { name: "September 2026" });
    expect(
      within(october)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Open Questions for Dr Sato", "Open Empty page"]);
    expect(within(october).getByText("Ask about patches")).toBeInTheDocument();
    expect(within(october).getByText("No text yet")).toBeInTheDocument();
    // Whitespace and line breaks fold into one preview line.
    expect(within(september).getByText("Hot flashes at night")).toBeInTheDocument();
    expect(
      october.compareDocumentPosition(september) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("filters by title or text once there are enough notes to search", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(
      page([
        note("n1", "Sleep diary", "LILAC", "woke twice"),
        note("n2", "Questions", "PLUM", "Ask about patches"),
        note("n3", "Work", "ICE", "meeting"),
        note("n4", "Food", "ROSE", "coffee"),
      ]),
    );
    renderPage();

    await user.type(await screen.findByLabelText("Search your notes"), "patch");
    expect(screen.getByRole("button", { name: "Open Questions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Sleep diary" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search your notes"));
    await user.type(screen.getByLabelText("Search your notes"), "zzz");
    expect(screen.getByText("No notes match \u201czzz\u201d.")).toBeInTheDocument();
  });

  it("asks before leaving a page with unsaved changes, and keeps the text on Keep editing", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(page([note("n1", "Sleep diary", "LILAC", "Mon: woke twice")]));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Open Sleep diary" }));
    expect(screen.getByText(/Started .* · Last edited/)).toBeInTheDocument();
    // Untouched: leaves straight away.
    await user.click(screen.getByRole("button", { name: "Back to notes" }));
    await user.click(await screen.findByRole("button", { name: "Open Sleep diary" }));

    await user.type(screen.getByLabelText("Notes"), " and again");
    await user.click(screen.getByRole("button", { name: "Back to notes" }));
    const ask = screen.getByRole("group", { name: /Leave without saving\?/ });
    await user.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Notes")).toHaveValue("Mon: woke twice and again");

    await user.click(screen.getByRole("button", { name: "Back to notes" }));
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByRole("button", { name: "Open Sleep diary" })).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("confirms on the page before deleting, and says so if the delete fails", async () => {
    const user = userEvent.setup();
    list.mockResolvedValue(page([note("n1", "Sleep diary")]));
    remove.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Open Sleep diary" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const ask = screen.getByRole("group", { name: "Delete this note? This cannot be undone." });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This could not be deleted.");

    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith("n1");
  });
});
