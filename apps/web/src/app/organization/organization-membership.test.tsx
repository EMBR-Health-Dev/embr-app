import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

const ORG_ID = "org-1";

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

// Stable object reference — same reasoning as every other page test in
// this app: the page's fetch-on-mount effects depend on
// [user]/[selectedOrgId], and a fresh literal per render would
// re-trigger them.
const mockUser = {
  id: "u1",
  email: "member@embr.health",
  emailVerified: true,
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const membersListMock = vi.fn();
const membersRevokeMock = vi.fn();
const membersLeaveMock = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    organizations: {
      mine: () =>
        Promise.resolve([
          {
            organizationId: ORG_ID,
            organizationName: "Acme Co",
            organizationSlug: "acme",
            role: "ORG_ADMIN",
            joinedAt: "2026-01-01T00:00:00Z",
          },
        ]),
      get: () =>
        Promise.resolve({
          id: ORG_ID,
          name: "Acme Co",
          slug: "acme",
          seatLimit: 10,
          memberCount: 2,
          createdAt: "2026-01-01T00:00:00Z",
        }),
      members: {
        list: (...args: unknown[]) => membersListMock(...args),
        revoke: (...args: unknown[]) => membersRevokeMock(...args),
        leave: (...args: unknown[]) => membersLeaveMock(...args),
      },
      trends: {
        symptomFrequency: () =>
          Promise.resolve({ suppressed: true, cohortSize: 0, categories: [] }),
      },
      sso: { get: () => Promise.resolve(null) },
      invites: { create: vi.fn() },
      billing: {
        get: () =>
          Promise.resolve({
            hasStripeCustomer: false,
            subscriptionStatus: null,
            seatLimit: null,
            seatsUsed: 2,
            currentPeriodEnd: null,
            billingEnabled: false,
          }),
      },
    },
  },
}));

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

async function renderOrgPage() {
  const { default: OrganizationPage } = await import("./page");
  renderWithIntl(<OrganizationPage />);
}

const ROSTER = {
  items: [
    {
      id: "m1",
      userId: mockUser.id,
      email: mockUser.email,
      role: "ORG_ADMIN",
      joinedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "m2",
      userId: "u2",
      email: "colleague@embr.health",
      role: "ORG_MEMBER",
      joinedAt: "2026-01-02T00:00:00Z",
    },
  ],
  page: 1,
  pageSize: 100,
  total: 2,
  totalPages: 1,
};

beforeEach(() => {
  routerReplace.mockClear();
  membersListMock.mockReset().mockResolvedValue(ROSTER);
  membersRevokeMock.mockReset();
  membersLeaveMock.mockReset();
});

describe("Organization page — leave organization", () => {
  it("shows 'Leave organization' only on the current user's own row, never on another member's", async () => {
    await renderOrgPage();

    await screen.findByText("colleague@embr.health");

    expect(screen.getByText("Leave organization")).toBeInTheDocument();
    // The other member's row gets the ORG_ADMIN-only revoke action,
    // never a leave action of their own — leaving is self-service,
    // not something one member can trigger for another.
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });

  it("shows a confirmation step before actually leaving — clicking the action once does not call the API", async () => {
    await renderOrgPage();
    await screen.findByText("colleague@embr.health");

    fireEvent.click(screen.getByText("Leave organization"));

    expect(await screen.findByText("Are you sure?")).toBeInTheDocument();
    expect(membersLeaveMock).not.toHaveBeenCalled();
  });

  it("cancelling the confirmation leaves the membership untouched", async () => {
    await renderOrgPage();
    await screen.findByText("colleague@embr.health");

    fireEvent.click(screen.getByText("Leave organization"));
    await screen.findByText("Are you sure?");
    fireEvent.click(screen.getByText("Cancel"));

    expect(await screen.findByText("Leave organization")).toBeInTheDocument();
    expect(membersLeaveMock).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("confirming calls the leave endpoint for this org and redirects away from the page", async () => {
    membersLeaveMock.mockResolvedValue(undefined);
    await renderOrgPage();
    await screen.findByText("colleague@embr.health");

    fireEvent.click(screen.getByText("Leave organization"));
    await screen.findByText("Are you sure?");
    fireEvent.click(screen.getByText("Yes, leave"));

    await waitFor(() => expect(membersLeaveMock).toHaveBeenCalledWith(ORG_ID));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error and does not redirect when leaving fails", async () => {
    membersLeaveMock.mockRejectedValue(new Error("network error"));
    await renderOrgPage();
    await screen.findByText("colleague@embr.health");

    fireEvent.click(screen.getByText("Leave organization"));
    await screen.findByText("Are you sure?");
    fireEvent.click(screen.getByText("Yes, leave"));

    expect(
      await screen.findByText("Couldn't leave the organization — try again."),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
