import { describe, expect, it, vi } from "vitest";

const { apiFetchBlob } = vi.hoisted(() => ({
  apiFetchBlob: vi.fn().mockResolvedValue(new Blob()),
}));
vi.mock("./api-client", () => ({ apiFetch: vi.fn(), apiFetchBlob }));

const { api } = await import("./api");

describe("api.export.clinicianSummaryPdf", () => {
  it("sends the device time zone with the range, so entries print on her local days", async () => {
    await api.export.clinicianSummaryPdf({ from: "2026-10-01T00:00:00.000Z" });

    expect(apiFetchBlob).toHaveBeenCalledWith("/export/summary.pdf", {
      from: "2026-10-01T00:00:00.000Z",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });
});
