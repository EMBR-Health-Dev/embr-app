import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => window.location.pathname,
}));
vi.mock("./api", () => ({
  api: { auth: { me: vi.fn().mockRejectedValue(new Error("not signed in")), logout: vi.fn() } },
}));

// The handler api-client.ts calls when a session it knew about has
// ended; captured so each test can fire it on a chosen page.
let sessionExpired: (() => void) | null = null;
vi.mock("./api-client", () => ({
  ApiError: class ApiError extends Error {},
  setSessionExpiredHandler: (handler: (() => void) | null) => {
    sessionExpired = handler;
  },
  setConsentRequiredHandler: vi.fn(),
  clearHadSession: vi.fn(),
}));

async function onPage(path: string) {
  window.history.pushState({}, "", path);
  const { AuthProvider } = await import("./auth-context");
  render(
    <AuthProvider>
      <div />
    </AuthProvider>,
  );
  await waitFor(() => expect(sessionExpired).not.toBeNull());
  sessionExpired!();
}

beforeEach(() => {
  replace.mockReset();
  sessionExpired = null;
});

describe("AuthProvider when a past session has expired", () => {
  it("sends someone on an app page to log in again", async () => {
    await onPage("/dashboard");
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
  });

  it.each([
    "/login-link?token=abc",
    "/reset-password?token=abc",
    "/verify-email?token=abc",
    "/organizations/accept-invite?token=abc",
    "/login",
  ])("leaves %s alone, so its one time token is not lost", async (path) => {
    await onPage(path);
    expect(replace).not.toHaveBeenCalledWith("/login?reason=session-expired");
  });
});
