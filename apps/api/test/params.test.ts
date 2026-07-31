import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "@embr/shared";
import type { Request } from "express";
import { requireParam } from "../src/lib/params.js";

function fakeRequest(params: Record<string, unknown>): Request {
  return { params } as unknown as Request;
}

describe("requireParam", () => {
  it("returns the param value when it's a plain string", () => {
    const req = fakeRequest({ id: "abc-123" });
    expect(requireParam(req, "id")).toBe("abc-123");
  });

  it("throws AppError.internal when the param is missing", () => {
    const req = fakeRequest({});
    expect(() => requireParam(req, "id")).toThrow(AppError);
    try {
      requireParam(req, "id");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe(ErrorCode.INTERNAL_ERROR);
      expect((err as AppError).statusCode).toBe(500);
    }
  });

  it("throws AppError.internal when the param is an array (repeated :name in the path)", () => {
    const req = fakeRequest({ id: ["one", "two"] });
    expect(() => requireParam(req, "id")).toThrow(AppError);
  });
});
