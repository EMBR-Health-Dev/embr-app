import { describe, expect, it } from "vitest";
import request from "supertest";

// Off is the default: until the MRS licence is confirmed the routes
// must not exist, signed in or not.
process.env.MRS_CHECK_IN_ENABLED = "false";

const { createApp } = await import("../src/app.js");

describe("MRS check-ins while switched off", () => {
  it("answers 404 for every route", async () => {
    const app = createApp();
    expect((await request(app).get("/mrs-check-ins")).status).toBe(404);
    expect((await request(app).put("/mrs-check-ins/2026-06-01").send({})).status).toBe(404);
    expect((await request(app).delete("/mrs-check-ins/2026-06-01")).status).toBe(404);
  });
});
