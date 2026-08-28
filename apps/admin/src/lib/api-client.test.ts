import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api-client";

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
  document.cookie = "embr_csrf=test-csrf-token";
});

afterEach(() => {
  document.cookie = "embr_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  vi.unstubAllGlobals();
});

describe("apiFetch — basic request/response handling", () => {
  it("returns the data field on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { id: "1" } }));

    const result = await apiFetch<{ id: string }>("/admin/users");

    expect(result).toEqual({ id: "1" });
  });

  it("returns undefined for a 204 response", async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));

    const result = await apiFetch<void>("/auth/sessions/s1", { method: "DELETE" });

    expect(result).toBeUndefined();
  });

  it("throws ApiError with the server's error shape on a non-2xx response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "Bad input" } }),
    );

    await expect(
      apiFetch("/auth/change-password", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Bad input",
    });
  });

  it("attaches the CSRF header on mutating requests but not GETs", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    await apiFetch("/admin/users");
    expect(fetchMock.mock.calls[0]![1].headers["x-csrf-token"]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await apiFetch("/auth/change-password", { method: "POST", body: {} });
    expect(fetchMock.mock.calls[1]![1].headers["x-csrf-token"]).toBe("test-csrf-token");
  });

  it("does not retry a 401 — apps/admin has no refresh-and-retry logic (yet; see @embr/sdk)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Access token expired" } }),
    );

    await expect(apiFetch("/admin/users")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
