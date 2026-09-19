import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import { endOfLocalDay, startOfLocalDay } from "../../lib/date-format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "person@embr.health" }, loading: false }),
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Export page — date range boundaries", () => {
  it("sends precise start/end-of-local-day instants in the download links, not bare date strings", async () => {
    // A bare "2026-02-01" is parsed by the API as UTC midnight — for
    // `to` specifically, that would silently exclude nearly the whole
    // picked end date from every export. Regression test for that bug.
    const user = userEvent.setup();
    const { default: ExportPage } = await import("./page");
    renderWithIntl(<ExportPage />);

    await user.type(screen.getByLabelText("From"), "2026-01-01");
    await user.type(screen.getByLabelText("To"), "2026-02-01");

    const link = screen.getByText("Symptom logs (CSV)").closest("a");
    expect(link).not.toBeNull();
    const url = new URL(link!.getAttribute("href")!, "http://localhost");
    expect(url.searchParams.get("from")).toBe(startOfLocalDay("2026-01-01"));
    expect(url.searchParams.get("to")).toBe(endOfLocalDay("2026-02-01"));
  });

  it("omits from/to entirely when no dates are picked", async () => {
    const { default: ExportPage } = await import("./page");
    renderWithIntl(<ExportPage />);

    const link = await screen.findByText("Symptom logs (CSV)");
    const href = link.closest("a")!.getAttribute("href")!;
    expect(href).toBe("/api/export/symptom-logs.csv");
  });
});
