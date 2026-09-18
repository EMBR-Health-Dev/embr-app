import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth-context";
import { OnboardingProvider, useOnboarding } from "./onboarding-context";
import { api } from "./api";

vi.mock("./api", () => ({
  api: {
    auth: { me: vi.fn() },
    onboarding: { get: vi.fn(), patch: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function meResponse(onboardingCompletedAt: string | null) {
  return {
    id: "u1",
    email: "user@example.com",
    role: "MEMBER" as const,
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    onboardingCompletedAt,
  };
}

function TestConsumer() {
  const { user } = useAuth();
  const { patch } = useOnboarding();
  return (
    <div>
      <p>onboardingCompletedAt: {user?.onboardingCompletedAt ?? "null"}</p>
      <button onClick={() => void patch({ status: "completed" })}>finish</button>
      <button onClick={() => void patch({ currentStep: "WHATS_GOING_ON" })}>advance</button>
    </div>
  );
}

beforeEach(() => {
  vi.mocked(api.auth.me).mockReset();
  vi.mocked(api.onboarding.get).mockReset();
  vi.mocked(api.onboarding.patch).mockReset();
  vi.mocked(api.onboarding.get).mockResolvedValue({
    jobToBeDone: null,
    noticedAreas: [],
    appointmentStatus: null,
    currentStep: null,
    skipped: false,
    completedAt: null,
  });
});

// Regression test for the "Go to dashboard" / "Skip to dashboard" bug:
// AuthProvider's `user` carries its own separately-fetched
// onboardingCompletedAt (see auth.routes.ts's GET /auth/me), so
// finishing onboarding without refreshing it left dashboard/page.tsx's
// guard reading a stale, still-incomplete user and bouncing straight
// back to /onboarding — the button looked like it did nothing.
describe("OnboardingProvider.patch — auth state sync", () => {
  it("refreshes the auth user after a status patch, so onboardingCompletedAt is no longer stale", async () => {
    const user = userEvent.setup();
    vi.mocked(api.auth.me)
      .mockResolvedValueOnce(meResponse(null))
      .mockResolvedValueOnce(meResponse("2026-09-18T00:00:00.000Z"));
    vi.mocked(api.onboarding.patch).mockResolvedValue({
      jobToBeDone: null,
      noticedAreas: [],
      appointmentStatus: null,
      currentStep: null,
      skipped: false,
      completedAt: "2026-09-18T00:00:00.000Z",
    });

    render(
      <AuthProvider>
        <OnboardingProvider>
          <TestConsumer />
        </OnboardingProvider>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("onboardingCompletedAt: null")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("finish"));

    await waitFor(() =>
      expect(
        screen.getByText("onboardingCompletedAt: 2026-09-18T00:00:00.000Z"),
      ).toBeInTheDocument(),
    );
    expect(api.auth.me).toHaveBeenCalledTimes(2);
  });

  it("does not re-fetch the auth user for a patch with no status change", async () => {
    const user = userEvent.setup();
    vi.mocked(api.auth.me).mockResolvedValue(meResponse(null));
    vi.mocked(api.onboarding.patch).mockResolvedValue({
      jobToBeDone: null,
      noticedAreas: [],
      appointmentStatus: null,
      currentStep: "WHATS_GOING_ON",
      skipped: false,
      completedAt: null,
    });

    render(
      <AuthProvider>
        <OnboardingProvider>
          <TestConsumer />
        </OnboardingProvider>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("onboardingCompletedAt: null")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("advance"));

    await waitFor(() => expect(api.onboarding.patch).toHaveBeenCalled());
    expect(api.auth.me).toHaveBeenCalledTimes(1);
  });
});
