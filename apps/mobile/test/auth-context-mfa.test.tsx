// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
vi.mock("../lib/reminders", () => ({ clearReminder: vi.fn() }));
vi.mock("../lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  setSessionExpiredHandler: vi.fn(),
}));
const store = { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
vi.mock("../lib/token-storage", () => ({ tokenStorage: store }));
const loginApi = vi.fn();
const completeApi = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    auth: {
      me: vi.fn(),
      login: (...a: unknown[]) => loginApi(...a),
      completeMfa: (...a: unknown[]) => completeApi(...a),
    },
  },
}));

beforeEach(() => {
  store.get.mockReset().mockResolvedValue(null);
  store.set.mockReset().mockResolvedValue(undefined);
  loginApi.mockReset();
  completeApi.mockReset();
});

async function withAuth() {
  const { AuthProvider, useAuth } = await import("../lib/auth-context");
  let ctx: ReturnType<typeof useAuth> | null = null;
  function Probe() {
    ctx = useAuth();
    return null;
  }
  await act(async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return () => ctx!;
}

describe("mobile auth — two-step sign in", () => {
  it("stores no tokens until the code is accepted", async () => {
    const auth = await withAuth();
    loginApi.mockResolvedValue({ mfaRequired: true, mfaToken: "challenge-token" });

    let result: unknown;
    await act(async () => {
      result = await auth().login("person@embr.health", "Sup3rSecret!Pass");
    });
    expect(result).toEqual({ mfaToken: "challenge-token" });
    expect(store.set).not.toHaveBeenCalled();
    expect(auth().user).toBeNull();

    const user = { id: "u1", onboardingCompletedAt: null };
    completeApi.mockResolvedValue({ user, accessToken: "at", refreshToken: "rt" });
    await act(async () => {
      await auth().completeMfa("challenge-token", "123456");
    });
    expect(completeApi).toHaveBeenCalledWith({ mfaToken: "challenge-token", code: "123456" });
    expect(store.set).toHaveBeenCalledWith({ accessToken: "at", refreshToken: "rt" });
    expect(auth().user).toEqual(user);
  });

  it("signs straight in when two-step sign in is off", async () => {
    const auth = await withAuth();
    const user = { id: "u1", onboardingCompletedAt: null };
    loginApi.mockResolvedValue({ user, accessToken: "at", refreshToken: "rt" });
    let result: unknown;
    await act(async () => {
      result = await auth().login("person@embr.health", "Sup3rSecret!Pass");
    });
    expect(result).toEqual({ user });
    expect(store.set).toHaveBeenCalledWith({ accessToken: "at", refreshToken: "rt" });
  });
});
