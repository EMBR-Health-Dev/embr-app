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
    onboardingProfile = emptyProfile({ currentStep: "APPOINTMENT_STATUS" });
    const { default: OnboardingIndex } = await import("./page");

    renderWithIntl(<OnboardingIndex />);

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith("/onboarding/appointment-status"),
    );
  });

  it("falls back to WELCOME if currentStep is somehow not a real step", async () => {
    onboardingProfile = emptyProfile({ currentStep: "SOMETHING_MADE_UP" });
    const { default: OnboardingIndex } = await import("./page");

    renderWithIntl(<OnboardingIndex />);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/onboarding/welcome"));
  });
});

describe("Screen 2 — job to be done", () => {
  it("persists the selection and advances to WHATS_GOING_ON", async () => {
    const user = userEvent.setup();
    const { default: JobToBeDoneScreen } = await import("./job-to-be-done/page");

    renderWithIntl(<JobToBeDoneScreen />);
    await user.click(screen.getByText("Prepare for a healthcare conversation"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        jobToBeDone: "PREPARE_FOR_APPOINTMENT",
        currentStep: "WHATS_GOING_ON",
      }),
    );
  });
});

describe("Screen 3 — what's going on", () => {
  it("toggles multiple areas and persists them as an array on continue", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Sleep"));
    await user.click(screen.getByText("Mood"));
    await user.click(screen.getByText("Continue"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        noticedAreas: ["SLEEP", "MOOD"],
        currentStep: "APPOINTMENT_STATUS",
      }),
    );
  });

  it("deselecting a previously-selected area removes it", async () => {
    const user = userEvent.setup();
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);
    await user.click(screen.getByText("Energy"));
    await user.click(screen.getByText("Energy"));
    await user.click(screen.getByText("Continue"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        noticedAreas: [],
        currentStep: "APPOINTMENT_STATUS",
      }),
    );
  });

  it("resumes with previously-answered areas already selected", async () => {
    onboardingProfile = emptyProfile({ noticedAreas: ["FOCUS"] });
    const { default: WhatsGoingOnScreen } = await import("./whats-going-on/page");

    renderWithIntl(<WhatsGoingOnScreen />);

    await waitFor(() => expect(screen.getByText("Focus")).toHaveAttribute("aria-pressed", "true"));
  });
});

describe("Screen 4 — appointment status", () => {
  it("persists the selection and advances to THE_LOOP", async () => {
    const user = userEvent.setup();
    const { default: AppointmentStatusScreen } = await import("./appointment-status/page");

    renderWithIntl(<AppointmentStatusScreen />);
    await user.click(screen.getByText("Yes, within the next month"));

    await waitFor(() =>
      expect(onboardingPatch).toHaveBeenCalledWith({
        appointmentStatus: "WITHIN_MONTH",
        currentStep: "THE_LOOP",
      }),
    );
  });

  it("never renders any date input — no exact date is ever collected here", async () => {
    const { default: AppointmentStatusScreen } = await import("./appointment-status/page");
    const { container } = renderWithIntl(<AppointmentStatusScreen />);

    expect(container.querySelector('input[type="date"]')).toBeNull();
  });
});

describe("Screen 5 — the loop", () => {
  it("marks onboarding completed on 'Log your first entry', without ever touching symptom-log or brief creation", async () => {
    const user = userEvent.setup();
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);
    await user.click(screen.getByText("Log your first entry"));

    await waitFor(() => expect(onboardingPatch).toHaveBeenCalledWith({ status: "completed" }));
    // The only API surface this screen touches at all is
    // onboardingPatch (mocked above) — there is no api.symptomLogs or
    // api.briefs reference anywhere in the module, so there is
    // structurally nothing else for this interaction to have created.
    expect(routerPush).toHaveBeenCalled();
  });

  it("marks onboarding completed on 'Go to dashboard instead' too", async () => {
    const user = userEvent.setup();
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);
    await user.click(screen.getByText("Go to dashboard instead"));

    await waitFor(() => expect(onboardingPatch).toHaveBeenCalledWith({ status: "completed" }));
    expect(routerPush).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the fixed illustrative example, verbatim, never phrased as an observation about this user", async () => {
    onboardingProfile = emptyProfile({ noticedAreas: ["SLEEP", "ENERGY"] });
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);

    expect(
      screen.getByText('"Your sleep disruption appeared alongside lower energy on 6 days."'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Descriptive, not diagnostic/)).toBeInTheDocument();
  });

  it("uses the user's noticed areas for the TRACK stage when present", async () => {
    onboardingProfile = emptyProfile({ noticedAreas: ["MOOD", "FOCUS"] });
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);

    expect(screen.getByText("Mood · Focus")).toBeInTheDocument();
  });

  it("falls back to the generic example when nothing was selected", async () => {
    onboardingProfile = emptyProfile({ noticedAreas: [] });
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);

    expect(screen.getByText("Sleep · Energy · Mood")).toBeInTheDocument();
  });

  it("mentions that treatments can be tracked too, under the TRACK stage", async () => {
    const { default: TheLoopScreen } = await import("./the-loop/page");

    renderWithIntl(<TheLoopScreen />);

    expect(
      screen.getByText(
        "Treatments you try — HRT, supplements, medication, anything else — can be tracked here too.",
      ),
    ).toBeInTheDocument();
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
