import { render, waitFor } from "@testing-library/react-native";
import IndexScreen from "../app/index";

// expo-router's real Redirect needs an actual navigation container to
// render into — outside one it throws. Mocked to a component that
// just records which href it was asked to redirect to, so this test
// can assert on redirect *intent* without needing a full router tree.
const redirectCalls: string[] = [];
jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    redirectCalls.push(href);
    return null;
  },
}));

const mockUseAuth = jest.fn();
jest.mock("../lib/auth-context", () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  redirectCalls.length = 0;
  mockUseAuth.mockReset();
});

describe("app/index — auth-state redirect", () => {
  it("shows a loading indicator while auth state is still resolving, redirecting nowhere yet", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    await render(<IndexScreen />);

    expect(redirectCalls).toEqual([]);
  });

  it("redirects to /login when there is no user", async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    await render(<IndexScreen />);

    await waitFor(() => expect(redirectCalls).toEqual(["/login"]));
  });

  it("redirects to /onboarding when the user hasn't completed onboarding", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1", email: "person@embr.health", onboardingCompletedAt: null },
      loading: false,
    });

    await render(<IndexScreen />);

    await waitFor(() => expect(redirectCalls).toEqual(["/onboarding"]));
  });

  it("redirects to /(app) when onboarding is already completed", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u1",
        email: "person@embr.health",
        onboardingCompletedAt: "2026-01-01T00:00:00Z",
      },
      loading: false,
    });

    await render(<IndexScreen />);

    await waitFor(() => expect(redirectCalls).toEqual(["/(app)"]));
  });
});
