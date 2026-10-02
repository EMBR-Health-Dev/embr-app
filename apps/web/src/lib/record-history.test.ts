import { beforeEach, describe, expect, it, vi } from "vitest";

const symptomLogsList = vi.fn();
const cycleEntriesList = vi.fn();
const treatmentsList = vi.fn();

vi.mock("./api", () => ({
  api: {
    symptomLogs: { list: (...args: unknown[]) => symptomLogsList(...args) },
    cycleEntries: { list: (...args: unknown[]) => cycleEntriesList(...args) },
    treatments: { list: (...args: unknown[]) => treatmentsList(...args) },
  },
}));

function page<T>(items: T[], total: number) {
  return { items, total, page: 1, pageSize: 1, totalPages: total };
}

beforeEach(() => {
  symptomLogsList.mockReset();
  cycleEntriesList.mockReset();
  treatmentsList.mockReset();
});

describe("fetchRecordSpan", () => {
  it("starts the record at the earliest of the oldest symptom, cycle entry and treatment", async () => {
    // Lists are newest first: page 1 at size 1 gives the total, the
    // last page gives the oldest item.
    symptomLogsList.mockImplementation(({ page: p }: { page?: number }) =>
      Promise.resolve(
        p === 40
          ? page([{ occurredAt: "2026-03-10T09:00:00" }], 40)
          : page([{ occurredAt: "2026-09-29T09:00:00" }], 40),
      ),
    );
    cycleEntriesList.mockImplementation(({ page: p }: { page?: number }) =>
      Promise.resolve(
        p === 3 ? page([{ date: "2026-02-14" }], 3) : page([{ date: "2026-09-01" }], 3),
      ),
    );
    treatmentsList.mockResolvedValue(page([{ startDate: "2026-05-01" }], 1));

    const { fetchRecordSpan } = await import("./record-history");
    const span = await fetchRecordSpan();

    expect(span).toEqual({
      start: "2026-02-14",
      symptomCount: 40,
      cycleCount: 3,
      treatmentCount: 1,
    });
    expect(symptomLogsList).toHaveBeenCalledWith({ page: 40, pageSize: 1 });
  });

  it("returns a null start for an empty record without asking for an oldest page", async () => {
    symptomLogsList.mockResolvedValue(page([], 0));
    cycleEntriesList.mockResolvedValue(page([], 0));
    treatmentsList.mockResolvedValue(page([], 0));

    const { fetchRecordSpan } = await import("./record-history");

    expect(await fetchRecordSpan()).toEqual({
      start: null,
      symptomCount: 0,
      cycleCount: 0,
      treatmentCount: 0,
    });
    expect(symptomLogsList).toHaveBeenCalledTimes(1);
  });
});

describe("rangeStartDate", () => {
  it("starts 'all' at the record's first entry, and falls back to 90 days with no entries", async () => {
    const { daysAgoIsoDate, rangeStartDate } = await import("./record-history");

    expect(rangeStartDate("all", "2025-11-03")).toBe("2025-11-03");
    expect(rangeStartDate("all", null)).toBe(daysAgoIsoDate(90));
    expect(rangeStartDate("90d", "2025-11-03")).toBe(daysAgoIsoDate(90));
    expect(rangeStartDate("12m", "2025-11-03")).toBe(daysAgoIsoDate(365));
  });
});
