import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

// Stable object reference, mutated between tests rather than replaced
// — same reasoning as settings.test.tsx: the data-loading effect
// depends on [isAdmin], so a fresh literal per render would make it
// re-fire spuriously.
const mockAuth = {
  user: null as { id: string; email: string; role: "ADMIN" | "MEMBER" } | null,
  isAdmin: false,
  loading: true,
  logout: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => mockAuth,
}));

const listUsersMock = vi.fn().mockResolvedValue({ items: [] });
const listAuditLogsMock = vi.fn().mockResolvedValue({ items: [] });
vi.mock("../../lib/api", () => ({
  api: {
    admin: {
      listUsers: (...args: unknown[]) => listUsersMock(...args),
      listAuditLogs: (...args: unknown[]) => listAuditLogsMock(...args),
    },
  },
}));

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  listUsersMock.mockClear();
  listUsersMock.mockResolvedValue({ items: [] });
  listAuditLogsMock.mockClear();
  listAuditLogsMock.mockResolvedValue({ items: [] });
  mockAuth.user = { id: "u1", email: "admin@embr.health", role: "ADMIN" };
  mockAuth.isAdmin = true;
  mockAuth.loading = false;
  mockAuth.logout.mockClear();
});

describe("Admin dashboard — access gating", () => {
  it("redirects to /login when there is no signed-in user", async () => {
    mockAuth.user = null;
    mockAuth.isAdmin = false;
    mockAuth.loading = false;
    const { default: DashboardPage } = await import("./page");
    render(<DashboardPage />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("shows a not-authorized screen for a signed-in non-admin, and logs out on request", async () => {
    mockAuth.user = { id: "u1", email: "person@embr.health", role: "MEMBER" };
    mockAuth.isAdmin = false;
    const { default: DashboardPage } = await import("./page");
    render(<DashboardPage />);

    expect(screen.getByText("Not authorized")).toBeInTheDocument();
    expect(
      screen.getByText(/person@embr\.health is signed in but doesn't have admin access/),
    ).toBeInTheDocument();
    expect(listUsersMock).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(mockAuth.logout).toHaveBeenCalled());
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
  });
});

describe("Admin dashboard — users and audit tabs", () => {
  it("loads and renders the users table by default", async () => {
    listUsersMock.mockResolvedValue({
      items: [
        {
          id: "u1",
          email: "person@embr.health",
          role: "MEMBER",
          emailVerified: true,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const { default: DashboardPage } = await import("./page");
    render(<DashboardPage />);

    expect(await screen.findByText("person@embr.health")).toBeInTheDocument();
    expect(listAuditLogsMock).not.toHaveBeenCalled();
  });

  it("switching to the audit tab loads audit logs instead of users", async () => {
    listAuditLogsMock.mockResolvedValue({
      items: [
        {
          id: "log1",
          action: "user.login",
          userId: "u1",
          ipAddress: "1.1.1.1",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const { default: DashboardPage } = await import("./page");
    render(<DashboardPage />);
    await waitFor(() => expect(listUsersMock).toHaveBeenCalledTimes(1));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Audit log" }));

    expect(await screen.findByText("user.login")).toBeInTheDocument();
    expect(listAuditLogsMock).toHaveBeenCalledTimes(1);
    // Switching tabs doesn't re-fetch the tab that's no longer active.
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state while a tab's data is in flight", async () => {
    let resolveUsers!: (value: { items: unknown[] }) => void;
    listUsersMock.mockReturnValue(new Promise((resolve) => (resolveUsers = resolve)));
    const { default: DashboardPage } = await import("./page");
    render(<DashboardPage />);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();

    resolveUsers({ items: [] });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });
});
