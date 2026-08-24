import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

const ORG_ID = "org-1";

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

// Stable object reference — same reasoning as organization-billing.test.tsx's
// identical mockUser.
const mockUser = {
  id: "u1",
  email: "member@embr.health",
  emailVerified: true,
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

const membershipsMock = vi.fn();
const orgGetMock = vi.fn();
const membersListMock = vi.fn();
const membersRevokeMock = vi.fn();
const trendsMock = vi.fn();
const ssoGetMock = vi.fn();
const ssoUpsertMock = vi.fn();
const invitesCreateMock = vi.fn();
const billingGetMock = vi.fn();
const checkoutMock = vi.fn();
const portalMock = vi.fn();
const leaveMock = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    organizations: {
      mine: (...args: unknown[]) => membershipsMock(...args),
      get: (...args: unknown[]) => orgGetMock(...args),
      leave: (...args: unknown[]) => leaveMock(...args),
      members: {
        list: (...args: unknown[]) => membersListMock(...args),
        revoke: (...args: unknown[]) => membersRevokeMock(...args),
      },
      trends: {
        symptomFrequency: (...args: unknown[]) => trendsMock(...args),
      },
      sso: {
        get: (...args: unknown[]) => ssoGetMock(...args),
        upsert: (...args: unknown[]) => ssoUpsertMock(...args),
      },
      invites: {
        create: (...args: unknown[]) => invitesCreateMock(...args),
      },
      billing: {
        get: (...args: unknown[]) => billingGetMock(...args),
        createCheckoutSession: (...args: unknown[]) => checkoutMock(...args),
        createPortalSession: (...args: unknown[]) => portalMock(...args),
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

// Default admin-view fetch mocks — only exercised by the admin-view
// tests below (a plain-member-only user never sets selectedOrgId, so
// none of these ever get called for the member-view tests), but
// defined for every test so the admin-view ones render without any
// unrelated pending/hanging fetch.
const NOT_CONFIGURED_BILLING = {
  hasStripeCustomer: false,
  subscriptionStatus: null,
  seatLimit: null,
  seatsUsed: 1,
  currentPeriodEnd: null,
  billingEnabled: false,
};

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();

  membershipsMock.mockReset();
  orgGetMock.mockReset().mockResolvedValue({
    id: ORG_ID,
    name: "Acme Co",
    slug: "acme",
    seatLimit: 10,
    memberCount: 3,
    createdAt: "2026-01-01T00:00:00Z",
  });
  membersListMock
    .mockReset()
    .mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 });
  membersRevokeMock.mockReset();
  trendsMock.mockReset().mockResolvedValue({ suppressed: true, cohortSize: 0, categories: [] });
  ssoGetMock.mockReset().mockResolvedValue(null);
  ssoUpsertMock.mockReset();
  invitesCreateMock.mockReset();
  billingGetMock.mockReset().mockResolvedValue(NOT_CONFIGURED_BILLING);
  checkoutMock.mockReset();
  portalMock.mockReset();
  leaveMock.mockReset();
});

describe("Organization leave — regular member", () => {
  it("shows the leave organization control for a regular member", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("Acme Co")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument();
    // The non-admin dead-end message still shows — this isn't a
    // replacement for the admin management UI, just no longer a
    // total dead end.
    expect(
      screen.getByText(
        "You belong to an organization, but only its ORG_ADMIN can manage the roster and see aggregate trends. If that should be you, ask your organization's admin to change your role.",
      ),
    ).toBeInTheDocument();
  });

  it("clicking leave enters the confirmation state", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave organization" }));

    expect(screen.getByText("Leave this organization?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // The confirm step still labels the actual leave button "Leave
    // organization" — confirming it's the same button re-purposed, not
    // a second control appearing alongside the first.
    expect(screen.getAllByRole("button", { name: "Leave organization" })).toHaveLength(1);
  });

  it("cancelling confirmation returns to the normal state", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave organization" }));
    expect(screen.getByText("Leave this organization?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Leave this organization?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument();
    expect(leaveMock).not.toHaveBeenCalled();
  });

  it("a successful leave calls api.organizations.leave() and navigates to /dashboard", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    leaveMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave organization" }));
    await user.click(screen.getByRole("button", { name: "Leave organization" }));

    await waitFor(() => expect(leaveMock).toHaveBeenCalledWith(ORG_ID));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });

  it("a 409 response shows the translated last-admin error, without navigating", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { ApiError } = await import("../../lib/api-client");
    leaveMock.mockRejectedValue(
      new ApiError(409, "CONFLICT", "An organization must have at least one admin"),
    );
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Leave organization" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Leave organization" }));
    await user.click(screen.getByRole("button", { name: "Leave organization" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "You're the only admin, so you can't leave yet. Assign another admin first.",
        ),
      ).toBeInTheDocument(),
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("scopes a leave error to the organization that produced it when multiple organizations are shown", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: "org-a",
        organizationName: "Org A",
        organizationSlug: "org-a",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-01T00:00:00Z",
      },
      {
        organizationId: "org-b",
        organizationName: "Org B",
        organizationSlug: "org-b",
        role: "ORG_MEMBER",
        joinedAt: "2026-01-02T00:00:00Z",
      },
    ]);
    const { ApiError } = await import("../../lib/api-client");
    leaveMock.mockImplementation((organizationId: string) =>
      organizationId === "org-a"
        ? Promise.reject(new ApiError(409, "CONFLICT", "conflict"))
        : Promise.resolve(undefined),
    );
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("Org A")).toBeInTheDocument());
    const orgAItem = screen.getByText("Org A").closest("li")!;
    const orgBItem = screen.getByText("Org B").closest("li")!;

    await user.click(within(orgAItem).getByRole("button", { name: "Leave organization" }));
    await user.click(within(orgAItem).getByRole("button", { name: "Leave organization" }));

    await waitFor(() =>
      expect(
        within(orgAItem).getByText(
          "You're the only admin, so you can't leave yet. Assign another admin first.",
        ),
      ).toBeInTheDocument(),
    );
    // Org B is completely untouched: no error, no confirm state, still
    // its own plain "Leave organization" button, and its own leave was
    // never even attempted.
    expect(
      within(orgBItem).queryByText(
        "You're the only admin, so you can't leave yet. Assign another admin first.",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(orgBItem).getByRole("button", { name: "Leave organization" }),
    ).toBeInTheDocument();
    expect(leaveMock).toHaveBeenCalledTimes(1);
    expect(leaveMock).not.toHaveBeenCalledWith("org-b");
  });
});

describe("Organization leave — admin's own membership", () => {
  it("shows a leave control in 'Your membership', separate from the roster", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_ADMIN",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("Your membership")).toBeInTheDocument());
    expect(
      screen.getByText(
        "Leaving removes your access to this organization, including its roster and shared settings. You can rejoin later if you're invited again.",
      ),
    ).toBeInTheDocument();
    // Exactly one leave control on the page — it isn't duplicated
    // into (or confusable with) the roster's own "Revoke" actions.
    expect(screen.getAllByRole("button", { name: "Leave organization" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });

  it("a successful admin leave calls api.organizations.leave() and navigates to /dashboard", async () => {
    membershipsMock.mockResolvedValue([
      {
        organizationId: ORG_ID,
        organizationName: "Acme Co",
        organizationSlug: "acme",
        role: "ORG_ADMIN",
        joinedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    leaveMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("Your membership")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Leave organization" }));
    await user.click(screen.getByRole("button", { name: "Leave organization" }));

    await waitFor(() => expect(leaveMock).toHaveBeenCalledWith(ORG_ID));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });
});
