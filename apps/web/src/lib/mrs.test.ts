import { describe, expect, it } from "vitest";
import { isMrsDue } from "./mrs";

describe("isMrsDue", () => {
  it("is due when she has never done one", () => {
    expect(isMrsDue([], "2026-06-01")).toBe(true);
  });

  it("is not due 27 days after the latest check-in", () => {
    expect(isMrsDue([{ completedOn: "2026-05-05" }], "2026-06-01")).toBe(false);
  });

  it("is due 28 days after the latest check-in, whatever the order", () => {
    const rows = [{ completedOn: "2026-05-04" }, { completedOn: "2026-02-01" }];
    expect(isMrsDue(rows, "2026-06-01")).toBe(true);
  });
});
