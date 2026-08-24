import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";

const ORG_ID = "org-1";

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

// Stable object reference — same reasoning as settings.test.tsx's
// identical mockUser: the page's fetch-on-mount effects depend on
// [user]/[selectedOrgId], and a fresh literal per render would
// re-trigger them.
const mockUser = {
  id: "u1",
  email: "admin@embr.health",
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

vi.mock("../../lib/api", () => ({
  api: {
    organizations: {
      mine: (...args: unknown[]) => membershipsMock(...args),
      get: (...args: unknown[]) => orgGetMock(...args),
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

const NOT_CONFIGURED_STATUS = {
  hasStripeCustomer: false,
  subscriptionStatus: null,
  seatLimit: null,
  seatsUsed: 1,
  currentPeriodEnd: null,
  billingEnabled: false,
};

const NO_SUBSCRIPTION_STATUS = {
  hasStripeCustomer: false,
  subscriptionStatus: null,
  seatLimit: null,
  seatsUsed: 1,
  currentPeriodEnd: null,
  billingEnabled: true,
};

const ACTIVE_STATUS = {
  hasStripeCustomer: true,
  subscriptionStatus: "ACTIVE" as const,
  seatLimit: 10,
  seatsUsed: 3,
  currentPeriodEnd: "2026-09-01T00:00:00Z",
  billingEnabled: true,
};

// Replaces window.location with a plain mutable stub, scoped to this
// file only (not the shared test setup) — a real assignment to
// window.location.href in jsdom triggers its "Not implemented:
// navigation" machinery, which this sidesteps entirely, letting the
// redirect flows just be asserted as a plain property write.
let originalLocation: Location;
beforeAll(() => {
  originalLocation = window.location;
});
beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { href: "" },
  });
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();

  membershipsMock.mockReset().mockResolvedValue([
    {
      organizationId: ORG_ID,
      organizationName: "Acme Co",
      organizationSlug: "acme",
      role: "ORG_ADMIN",
      joinedAt: "2026-01-01T00:00:00Z",
    },
  ]);
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
  billingGetMock.mockReset();
  checkoutMock.mockReset();
  portalMock.mockReset();
});

describe("Organization billing — status loading", () => {
  it("shows a loading state, then the subscription status, seats, and renewal date", async () => {
    billingGetMock.mockResolvedValue(ACTIVE_STATUS);
    await renderOrgPage();

    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    expect(
      screen.getByText(new Date("2026-09-01T00:00:00Z").toLocaleDateString()),
    ).toBeInTheDocument();
  });

  it("shows 'no subscription yet' when subscriptionStatus is null", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("No subscription yet")).toBeInTheDocument());
  });

  it("does not invent a renewal date row when currentPeriodEnd is null", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("No subscription yet")).toBeInTheDocument());
    expect(screen.queryByText("Renews")).not.toBeInTheDocument();
  });
});

describe("Organization billing — not configured", () => {
  it("shows the not-configured message and no billing actions", async () => {
    billingGetMock.mockResolvedValue(NOT_CONFIGURED_STATUS);
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByText("Billing isn't set up on this deployment yet.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Start subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });
});

describe("Organization billing — unauthorized / load failure", () => {
  it("handles a 403 cleanly: shows an error, no crash, no billing actions rendered", async () => {
    const { ApiError } = await import("../../lib/api-client");
    billingGetMock.mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "You do not have access to this resource"),
    );
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByText("You do not have access to this resource")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Start subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
    // The rest of the page (unrelated to billing) still rendered fine —
    // a billing failure doesn't take down the whole console.
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
  });

  it("falls back to a generic message for a non-ApiError failure", async () => {
    billingGetMock.mockRejectedValue(new Error("network down"));
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByText("Couldn't load billing information.")).toBeInTheDocument(),
    );
  });
});

describe("Organization billing — checkout flow", () => {
  it("calls createCheckoutSession with the entered seat count and redirects to the returned Stripe URL", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    checkoutMock.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );

    const seatsInput = screen.getByLabelText("Seats");
    await user.clear(seatsInput);
    await user.type(seatsInput, "7");
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith(ORG_ID, { seats: 7 }));
    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.stripe.com/session_abc"),
    );
  });

  it("disables the button and shows a pending label while checkout is in flight", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    let resolveCheckout!: (value: { url: string }) => void;
    checkoutMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCheckout = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    const pendingButton = await screen.findByRole("button", { name: "Redirecting to Stripe…" });
    expect(pendingButton).toBeDisabled();

    resolveCheckout({ url: "https://checkout.stripe.com/session_xyz" });
    await waitFor(() =>
      expect(window.location.href).toBe("https://checkout.stripe.com/session_xyz"),
    );
  });

  it("shows a rate-limit error and re-enables the button on a 429", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    const { ApiError } = await import("../../lib/api-client");
    checkoutMock.mockRejectedValue(
      new ApiError(429, "RATE_LIMITED", "Too many requests — please try again later"),
    );
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    await waitFor(() =>
      expect(screen.getByText("Too many requests — please try again later")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Start subscription" })).not.toBeDisabled();
  });

  it("does not show the checkout CTA once a live subscription exists", async () => {
    billingGetMock.mockResolvedValue(ACTIVE_STATUS);
    await renderOrgPage();

    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Start subscription" })).not.toBeInTheDocument();
  });

  it("floors a fractional seat value before submitting", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    checkoutMock.mockResolvedValue({ url: "https://checkout.stripe.com/session_frac" });
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    const seatsInput = screen.getByLabelText("Seats");
    await user.clear(seatsInput);
    await user.type(seatsInput, "4.7");
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith(ORG_ID, { seats: 4 }));
  });

  it("clamps a seat value above the backend's max to the max", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    checkoutMock.mockResolvedValue({ url: "https://checkout.stripe.com/session_max" });
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    const seatsInput = screen.getByLabelText("Seats");
    await user.clear(seatsInput);
    await user.type(seatsInput, "999999999");
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith(ORG_ID, { seats: 100000 }));
  });

  it("submits 1 seat when the field is left empty", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    checkoutMock.mockResolvedValue({ url: "https://checkout.stripe.com/session_empty" });
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    const seatsInput = screen.getByLabelText("Seats");
    await user.clear(seatsInput);
    await user.click(screen.getByRole("button", { name: "Start subscription" }));

    await waitFor(() => expect(checkoutMock).toHaveBeenCalledWith(ORG_ID, { seats: 1 }));
  });
});

describe("Organization billing — customer portal flow", () => {
  it("calls createPortalSession and redirects to the returned Stripe URL", async () => {
    billingGetMock.mockResolvedValue(ACTIVE_STATUS);
    portalMock.mockResolvedValue({ url: "https://billing.stripe.com/portal_abc" });
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    await waitFor(() => expect(portalMock).toHaveBeenCalledWith(ORG_ID));
    await waitFor(() => expect(window.location.href).toBe("https://billing.stripe.com/portal_abc"));
  });

  it("does not show the manage-billing action when the org has no Stripe customer yet", async () => {
    billingGetMock.mockResolvedValue(NO_SUBSCRIPTION_STATUS);
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start subscription" })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
  });

  it("surfaces a portal error inline without navigating", async () => {
    billingGetMock.mockResolvedValue(ACTIVE_STATUS);
    const { ApiError } = await import("../../lib/api-client");
    portalMock.mockRejectedValue(
      new ApiError(409, "CONFLICT", "This organization has no billing history yet"),
    );
    const user = userEvent.setup();
    await renderOrgPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    await waitFor(() =>
      expect(screen.getByText("This organization has no billing history yet")).toBeInTheDocument(),
    );
    expect(window.location.href).toBe("");
  });
});
