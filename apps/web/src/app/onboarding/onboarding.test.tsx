import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingProfileDto } from "@embr/types";
import messages from "../../../messages/en.json";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

const authState: { user: { id: string } | null; loading: boolean } = {
  user: { id: "u1" },
  loading: false,
};
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => authState,
}));

const onboardingPatch = vi.fn();
let onboardingProfile: OnboardingProfileDto | null = null;
let onboardingLoading = false;

vi.mock("../../lib/onboarding-context", () => ({
  useOnboarding: () => ({
    profile: onboardingProfile,
    loading: onboardingLoading,
    patch: onboardingPatch,
  }),
  OnboardingProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function emptyProfile(overrides: Partial<OnboardingProfileDto> = {}): OnboardingProfileDto {
  return {
    jobToBeDone: null,
    noticedAreas: [],
    appointmentStatus: null,
    lifeStage: null,
    lastPeriodDate: null,
    currentStep: null,
    skipped: false,
    completedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  onboardingPatch.mockClear();
  onboardingPatch.mockImplementation((input) => Promise.resolve({ ...emptyProfile(), ...input }));
  authState.user = { id: "u1" };
  authState.loading = false;
  onboardingProfile = emptyProfile();
  onboardingLoading = false;
});

describe("OnboardingLayout — auth gate", () => {
  it("redirects unauthenticated visitors to /login", async () => {
    authState.user = null;
    authState.loading = false;
    const { default: OnboardingLayout } = await import("./layout");

    renderWithIntl(<OnboardingLayout>{null}</OnboardingLayout>);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
  });

  it("does not redirect once a user is present", async () => {
    const { default: OnboardingLayout } = await import("./layout");

    renderWithIntl(<OnboardingLayout>content</OnboardingLayout>);

    await waitFor(() => expect(screen.getByText("content")).toBeInTheDocument());
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe("Onboarding index — resume behavior", () => {
  it("redirects to WELCOME when no step has been reached yet", async () => {
    onboardingProfile = emptyProfile({ currentStep: null });
    const { default: OnboardingIndex } = await import("./page");

    renderWithIntl(<OnboardingIndex />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/welcome"));
  });

  it("redirects to the stored currentStep, not the beginning", async () => {
    onboardingProfile = emptyProfile({ currentStep: "WHATS_GOING_ON" });
    const { default: OnboardingIndex } = await import("./page");

    renderWithIntl(<OnboardingIndex />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/whats-going-on"));
  });

  it("resumes someone stopped on a removed step at what she has noticed", async () => {
    for (const step of ["JOB_TO_BE_DONE", "LIFE_STAGE", "APPOINTMENT_STATUS", "THE_LOOP"]) {
      routerReplace.mockClear();
      onboardingProfile = emptyProfile({ currentStep: step });
      const { default: OnboardingIndex } = await import("./page");
      const { unmount } = renderWithIntl(<OnboardingIndex />);
      await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/whats-going-on"));
      unmount();
    }
  });

  it("falls back to WELCOME if currentStep is somehow not a real step", async () => {
    onboardingProfile = emptyProfile({ currentStep: "SOMETHING_MADE_UP" });
    const { default: OnboardingIndex } = await import("./page");

    renderWithIntl(<OnboardingIndex />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/welcome"));
  });
});

describe("Screen 2 — what's going on (the last one)", () => {
  it("toggles multiple areas and persists them as an array on continue", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Sleep"));
    await user.click(screen.getByText("Mood"));
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        noticedAreas: ["SLEEP", "MOOD"],
        status: "completed",
      }),
    );
  });

  it("deselecting a previously-selected area removes it", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Energy"));
    await user.click(screen.getByText("Energy"));
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        noticedAreas: [],
        status: "completed",
      }),
    );
  });

  it("resumes with previously-answered areas already selected", async () => {
    onboardingProfile = emptyProfile({ noticedAreas: ["FOCUS"] });
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Focus/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("offers Cycle and Something else alongside the original five areas", async () => {
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);

    expect(screen.getByRole("button", { name: /^Cycle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Something else/ })).toBeInTheDocument();
  });

  it("shows a few concrete examples under each area, not a second selectable list", async () => {
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);

    expect(
      screen.getByText(
        "Trouble falling asleep · Waking during the night · Night sweats · Waking tired",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Timing · Flow · Spotting · Premenstrual changes")).toBeInTheDocument();
    // Exactly 7 toggles (the areas) — the examples are plain supporting
    // text, not additional buttons a person could select individually.
    expect(
      screen.getAllByRole("button", { name: /Sleep|Energy|Mood|Body|Focus|Cycle|Something else/ }),
    ).toHaveLength(7);
  });

  it("persists CYCLE when it's the one selected", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByRole("button", { name: /^Cycle/ }));
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        noticedAreas: ["CYCLE"],
        status: "completed",
      }),
    );
  });
});

describe("Onboarding — two screens, then the first entry", () => {
  it("welcome goes straight to what she has noticed", async () => {
    const user = userEvent.setup();
    const { default: WelcomeScreen } = await import("./welcome/page");

    renderWithIntl(<WelcomeScreen />);
    await user.click(screen.getByText("Get started"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({ currentStep: "WHATS_GOING_ON" }),
    );
    expect(routerPush).toHaveBeenCalledWith("/onboarding/whats-going-on");
  });

  it("finishes onboarding and opens her first entry for the first area she picked", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Sleep"));
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() => expect(routerPush).toHaveBeenCalled());
    expect(String(routerPush.mock.calls[0]![0])).toMatch(/^\/dashboard\?logCategory=/);
  });

  it("opens a blank first entry when she picked nothing", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard?firstLog=1"));
  });

  it("shows two progress marks, not six", async () => {
    const { default: WelcomeScreen } = await import("./welcome/page");
    const { container } = renderWithIntl(<WelcomeScreen />);
    expect(container.querySelectorAll('[aria-hidden="true"] > span.rounded-full')).toHaveLength(2);
  });
});

describe("OnboardingScreen — skip behavior (shared by every screen)", () => {
  it("skipping sets status: skipped and routes to /dashboard", async () => {
    const user = userEvent.setup();
    const { default: WelcomeScreen } = await import("./welcome/page");

    renderWithIntl(<WelcomeScreen />);
    await user.click(screen.getByText("Skip to dashboard"));

    await waitFor(() => expect(onboardingPatch).toHaveBeenCalledWith({ status: "skipped" }));
    expect(routerReplace).toHaveBeenCalledWith("/dashboard");
  });
});
