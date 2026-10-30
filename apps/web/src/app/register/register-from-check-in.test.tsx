import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

const { push, registerMock, loginMock, refresh } = vi.hoisted(() => ({
  push: vi.fn(),
  registerMock: vi.fn(),
  loginMock: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("redirect=/check-in"),
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    auth: {
      register: (...args: unknown[]) => registerMock(...args),
      login: (...args: unknown[]) => loginMock(...args),
    },
  },
}));
vi.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false, refresh, logout: vi.fn() }),
}));

const CURRENT = { TERMS: "CURRENT", PRIVACY: "CURRENT", HEALTH_PROCESSING: "CURRENT" };

async function signUp() {
  const user = userEvent.setup();
  const { default: RegisterPage } = await import("./page");
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RegisterPage />
    </NextIntlClientProvider>,
  );
  await user.type(screen.getByLabelText("Email"), "new@embr.test");
  await user.type(screen.getByLabelText("Password"), "Sup3rSecret!Pass");
  for (const box of screen.getAllByRole("checkbox")) await user.click(box);
  await user.click(screen.getByRole("button", { name: "Create account" }));
}

beforeEach(() => {
  push.mockReset();
  registerMock.mockReset().mockResolvedValue({});
  loginMock.mockReset();
  refresh.mockReset().mockResolvedValue(undefined);
});

describe("Sign up from the first check in", () => {
  it("signs her in with the password she just typed and takes her back to save", async () => {
    loginMock.mockResolvedValue({ user: { consents: CURRENT } });
    await signUp();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/check-in"));
    expect(loginMock).toHaveBeenCalledWith({
      email: "new@embr.test",
      password: "Sup3rSecret!Pass",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("goes through the consent screen first when health consent was not given", async () => {
    loginMock.mockResolvedValue({
      user: { consents: { ...CURRENT, HEALTH_PROCESSING: "MISSING" } },
    });
    await signUp();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/consent?redirect=%2Fcheck-in"));
  });

  it("keeps her answers in the tab and points her to log in when that sign in fails", async () => {
    loginMock.mockRejectedValue(new Error("network"));
    await signUp();
    expect(
      await screen.findByText(
        "Your account was created. Log in to save your answers; they are still in this tab.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to login" })).toHaveAttribute(
      "href",
      "/login?redirect=%2Fcheck-in",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
