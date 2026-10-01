import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ConsentState } from "@embr/types";
import { LEGAL_DOCUMENT_VERSIONS } from "@embr/validation";
import messages from "../../../messages/en.json";
import { ApiError } from "../../lib/api-client";

const routerReplace = vi.fn();
let searchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => searchParamsValue,
}));

let consents: Record<"TERMS" | "PRIVACY" | "HEALTH_PROCESSING", ConsentState>;
const refreshMock = vi.fn().mockResolvedValue(undefined);
const logoutMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "person@embr.health", consents },
    loading: false,
    refresh: refreshMock,
    logout: logoutMock,
  }),
}));

const grantMock = vi.fn();
vi.mock("../../lib/api", () => ({
  api: { consents: { grant: (...args: unknown[]) => grantMock(...args) } },
}));

async function renderPage() {
  const { default: ConsentPage } = await import("./page");
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConsentPage />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  routerReplace.mockClear();
  refreshMock.mockClear();
  grantMock.mockReset();
  searchParamsValue = new URLSearchParams();
  consents = { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "MISSING" };
});

describe("Consent screen", () => {
  it("shows only the items that need review, unchecked", async () => {
    await renderPage();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName(/health information I provide/);
    expect(boxes[0]).not.toBeChecked();
  });

  it("shows every item for an account with nothing recorded", async () => {
    consents = { TERMS: "MISSING", PRIVACY: "MISSING", HEALTH_PROCESSING: "MISSING" };
    await renderPage();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("explains an updated document and a previous withdrawal", async () => {
    consents = { TERMS: "OUTDATED", PRIVACY: "CURRENT", HEALTH_PROCESSING: "WITHDRAWN" };
    await renderPage();
    expect(screen.getByText("Updated since you last reviewed it.")).toBeInTheDocument();
    expect(screen.getByText(/You withdrew this item earlier/)).toBeInTheDocument();
  });

  it("does not submit until every shown item is ticked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(grantMock).not.toHaveBeenCalled();
    expect(screen.getByText("Please tick each item above to continue.")).toBeInTheDocument();
  });

  it("records the pending items at their current versions, then continues to the destination", async () => {
    consents = { TERMS: "OUTDATED", PRIVACY: "CURRENT", HEALTH_PROCESSING: "MISSING" };
    searchParamsValue = new URLSearchParams({ redirect: "/brief" });
    grantMock.mockResolvedValue({});
    const user = userEvent.setup();
    await renderPage();
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/brief"));
    expect(grantMock).toHaveBeenCalledWith({
      consents: [
        { type: "TERMS", version: LEGAL_DOCUMENT_VERSIONS.TERMS },
        { type: "HEALTH_PROCESSING", version: LEGAL_DOCUMENT_VERSIONS.HEALTH_PROCESSING },
      ],
      locale: "en",
      client: "web",
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("never follows an off-site redirect", async () => {
    searchParamsValue = new URLSearchParams({ redirect: "//evil.example" });
    grantMock.mockResolvedValue({});
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
  });

  it("asks for a reload when the version changed in the meantime", async () => {
    grantMock.mockRejectedValue(new ApiError(409, "CONSENT_VERSION_OUTDATED", "Outdated"));
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Please reload the page/)).toBeInTheDocument();
  });

  it("always offers export, account settings (including deletion) and log out", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Export your data" })).toHaveAttribute(
      "href",
      "/export",
    );
    expect(screen.getByRole("link", { name: /Account settings/ })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("moves straight on when nothing is pending", async () => {
    consents = { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "CURRENT" };
    await renderPage();
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
