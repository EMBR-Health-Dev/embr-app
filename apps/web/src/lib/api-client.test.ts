import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, setSessionExpiredHandler } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // A CSRF cookie already present avoids the "fetch /api/auth/csrf to
  // get one" fallback path complicating call-count assertions below —
  // that fallback is exercised separately from what this file cares
  // about (the refresh-and-retry behavior).
  document.cookie = "embr_csrf=test-csrf-token";
  window.localStorage.clear();
  setSessionExpiredHandler(null);
});

afterEach(() => {
  document.cookie = "embr_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  vi.unstubAllGlobals();
  window.localStorage.clear();
  setSessionExpiredHandler(null);
});

describe("apiFetch — basic request/response handling", () => {
  it("returns the data field on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "1" } }));

    const result = await apiFetch<{ id: string }>("/symptom-logs");

    expect(result).toEqual({ id: "1" });
  });

  it("returns undefined for a 204 response", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));

    const result = await apiFetch<void>("/treatments/1", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  it("throws ApiError with the server's error shape on a non-2xx, non-401 response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "Bad input" } }),
    );

    await expect(apiFetch("/symptom-logs", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Bad input",
    });
  });

  it("attaches the CSRF header on mutating requests but not GETs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    await apiFetch("/symptom-logs");
    expect(fetchMock.mock.calls[0]![1].headers["x-csrf-token"]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await apiFetch("/symptom-logs", { method: "POST", body: {} });
    expect(fetchMock.mock.calls[1]![1].headers["x-csrf-token"]).toBe("test-csrf-token");
  });
});

describe("apiFetch — refresh-and-retry on 401", () => {
  it("silently refreshes and retries once when a request 401s, returning the retried result", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { user: { id: "u1" } } })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "log1" } })); // retried original

    const result = await apiFetch<{ id: string }>("/symptom-logs");

    expect(result).toEqual({ id: "log1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/refresh");
  });

  it("throws the original 401 when the refresh itself fails, without an infinite retry loop", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: "UNAUTHORIZED", message: "No refresh token presented" },
        }),
      );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({
      status: 401,
      message: "Access token expired",
    });
    // Exactly two calls — the original attempt and one refresh attempt.
    // No retry of the original request happens once refresh itself
    // failed, and no second refresh attempt is made either.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never attempts a refresh for a 401 from an auth endpoint itself", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: "UNAUTHORIZED", message: "Invalid email or password" },
      }),
    );

    await expect(
      apiFetch("/auth/login", { method: "POST", body: { email: "a@b.com", password: "x" } }),
    ).rejects.toMatchObject({ status: 401 });

    // Only the one call — a wrong-password 401 must never trigger a
    // refresh attempt (it isn't an expired-session case at all), and
    // must never recurse into /auth/refresh from within /auth/login.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent 401s into a single refresh attempt", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "expired" } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { user: { id: "u1" } } })) // /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "a" } })) // retried #1
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: "b" } })); // retried #2

    const [a, b] = await Promise.all([
      apiFetch<{ id: string }>("/symptom-logs"),
      apiFetch<{ id: string }>("/cycle-entries"),
    ]);

    expect(a).toEqual({ id: "a" });
    expect(b).toEqual({ id: "b" });
    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/auth/refresh");
    expect(refreshCalls).toHaveLength(1);
  });
});

describe("apiFetch — session-expired notification", () => {
  it("does not notify when refresh fails and this browser never had a successful authenticated call", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "No refresh token" } }),
      );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });

    // Matches the real "never logged in, hit a protected page
    // directly" case — this must stay silent, exactly as before this
    // feature existed.
    expect(handler).not.toHaveBeenCalled();
  });

  it("notifies exactly once when refresh fails after a prior successful authenticated call", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    // A real authenticated call succeeding first is what's supposed to
    // mark this browser as "had a session" — see markHadSession's own
    // doc comment in api-client.ts.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "1" } }));
    await apiFetch("/symptom-logs");
    expect(handler).not.toHaveBeenCalled();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Session expired" } }),
      );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not notify a successful login endpoint call on its own — only a subsequent authenticated call's refresh failure", async () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);

    // /auth/login is in NO_REFRESH_PATHS — a successful response from
    // it must not, by itself, mark this browser as having had a
    // session (see the apiFetch success path's own NO_REFRESH_PATHS
    // check), since a plain login success is not "an authenticated
    // request succeeded."
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { user: { id: "u1" } } }));
    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.com", password: "x" } });

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "No refresh token" } }),
      );

    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not throw when refresh fails and no handler is registered", async () => {
    setSessionExpiredHandler(null);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "1" } }));
    await apiFetch("/symptom-logs");

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Session expired" } }),
      );

    // Should reject with the original ApiError, not throw some other
    // error from calling a null handler.
    await expect(apiFetch("/symptom-logs")).rejects.toMatchObject({ status: 401 });
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
