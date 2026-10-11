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
  }),
}));

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
vi.mock("../../lib/api", () => ({
  api: {
    notes: {
      list: (...a: unknown[]) => list(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => remove(...a),
    },
  },
}));

function note(id: string, title: string, cover = "LILAC", body = "") {
  return {
    id,
    title,
    body,
    cover,
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-02T08:00:00Z",
  };
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
    expect(await screen.findByText(/No notebooks yet/)).toBeInTheDocument();
  });

  it("shows each notebook as a cover with its title", async () => {
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

    await user.click(await screen.findByRole("button", { name: "New notebook" }));
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
    await user.click(await screen.findByRole("button", { name: "New notebook" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give this notebook a title.");
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
});
