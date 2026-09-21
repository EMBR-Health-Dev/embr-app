import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, ApiError, setSessionExpiredHandler } from "./api-client";

const { mockGet, mockSet, mockClear } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockClear: vi.fn(),
}));

vi.mock("./token-storage", () => ({
  tokenStorage: { get: mockGet, set: mockSet, clear: mockClear },
}));

// A minimal stand-in for the real i18next instance — api-client.ts only
// ever reads `.language` off it, and importing the real module here
// would pull in i18next/react-i18next initialization this file has no
// need for.
vi.mock("./i18n", () => ({ i18n: { language: "en" } }));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();
const STORED = { accessToken: "at-1", refreshToken: "rt-1" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockGet.mockReset();
  mockSet.mockReset().mockResolvedValue(undefined);
  mockClear.mockReset().mockResolvedValue(undefined);
  setSessionExpiredHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(null);
});

describe("apiFetch — session-expired notification", () => {
  it("notifies exactly once when a stored session's refresh fails after a 401", async () => {
    mockGet.mockResolvedValue(STORED);
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Session expired" } }),
      );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });

    expect(handler).toHaveBeenCalledTimes(1);
    // The stored refresh token must be dropped once it's confirmed
    // dead — otherwise a later call would keep presenting the same
    // dead token and keep re-triggering this same failure.
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("does not notify a never-authenticated session — no stored tokens means no refresh is even attempted", async () => {
    mockGet.mockResolvedValue(null);
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
    );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });

    // Matches the real "never logged in, hit a screen that fetches
    // anyway" case — this must stay silent, and must not waste a
    // network round-trip on a refresh call that could never succeed
    // without a stored refresh token to present.
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent 401s into a single refresh network call and notifies exactly once", async () => {
    mockGet.mockResolvedValue(STORED);
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "refresh token dead" } }),
      );

    const [a, b] = await Promise.allSettled([
      apiFetch("/symptom-logs"),
      apiFetch("/cycle-entries"),
    ]);

    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");

    // refreshInFlight correctly de-dupes the actual network call...
    const refreshCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].endsWith("/auth/refresh"),
    );
    expect(refreshCalls).toHaveLength(1);
    // ...and the notification lives inside that same shared refresh
    // attempt (see refreshAccessToken's catch block), not in each
    // caller's post-await check, so it fires exactly once for the one
    // underlying session death, regardless of how many concurrent
    // callers were waiting on it.
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("ApiError", () => {
  it("carries status, code, message, and optional field details", () => {
    const err = new ApiError(400, "VALIDATION_ERROR", "Bad input", [
      { field: "email", message: "required" },
    ]);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Bad input");
    expect(err.details).toEqual([{ field: "email", message: "required" }]);
  });
});
