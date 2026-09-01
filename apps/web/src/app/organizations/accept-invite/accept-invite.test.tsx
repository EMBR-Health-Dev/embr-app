import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en.json";

let searchParamsValue = new URLSearchParams({ token: "invite-token-1" });
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => searchParamsValue,
}));

const mockUser = {
  id: "u1",
  email: "person@embr.health",
  onboardingCompletedAt: "2026-01-01T00:00:00Z",
};
vi.mock("../../../lib/auth-context", () => ({
  useAuth: () => ({ user: mockUser, loading: false, logout: vi.fn() }),
}));

const acceptMock = vi.fn();
const mineMock = vi.fn();
vi.mock("../../../lib/api", () => ({
  api: {
    organizations: {
      invites: { accept: (...args: unknown[]) => acceptMock(...args) },
      mine: (...args: unknown[]) => mineMock(...args),
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

beforeEach(() => {
  searchParamsValue = new URLSearchParams({ token: "invite-token-1" });
  acceptMock.mockReset();
  mineMock.mockReset().mockResolvedValue([]);
});

describe("Accept-invite page — employee privacy note", () => {
  it("shows the individual-data-stays-private note once the invite is accepted", async () => {
    acceptMock.mockResolvedValue(undefined);
    const { default: AcceptInvitePage } = await import("./page");
    renderWithIntl(<AcceptInvitePage />);

    await waitFor(() => expect(screen.getByText("You're in")).toBeInTheDocument());
    expect(
      screen.getByText(
        "Your individual health data stays private. Your employer cannot see your individual symptom records. Organization insights are shown only as aggregate, anonymized trends when there is enough data to protect individual privacy.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the privacy note in the already-member state", async () => {
    const { ApiError } = await import("../../../lib/api-client");
    acceptMock.mockRejectedValue(new ApiError(409, "CONFLICT", "Already a member"));
    const { default: AcceptInvitePage } = await import("./page");
    renderWithIntl(<AcceptInvitePage />);

    await waitFor(() => expect(screen.getByText("Already a member")).toBeInTheDocument());
    expect(
      screen.queryByText(
        "Your individual health data stays private. Your employer cannot see your individual symptom records. Organization insights are shown only as aggregate, anonymized trends when there is enough data to protect individual privacy.",
      ),
    ).not.toBeInTheDocument();
  });
});
