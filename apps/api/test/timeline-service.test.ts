import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/modules/timeline/timeline.repository.js", () => ({
  timelineRepository: {
    symptomLogsForTimeline: vi.fn(),
    listTreatmentsOverlappingRange: vi.fn(),
    listBriefsGeneratedInRange: vi.fn(),
  },
}));

import { timelineRepository } from "../src/modules/timeline/timeline.repository.js";
import { timelineService } from "../src/modules/timeline/timeline.service.js";

const mockedRepo = vi.mocked(timelineRepository);

beforeEach(() => {
  vi.clearAllMocks();
  mockedRepo.symptomLogsForTimeline.mockResolvedValue([]);
  mockedRepo.listTreatmentsOverlappingRange.mockResolvedValue([]);
  mockedRepo.listBriefsGeneratedInRange.mockResolvedValue([]);
});

describe("timelineService.get", () => {
  it("returns an empty list when there's nothing in range", async () => {
    const events = await timelineService.get("user-1", {});
    expect(events).toEqual([]);
  });

  it("omits weeks with zero symptom logs — an empty week isn't an event", async () => {
    mockedRepo.symptomLogsForTimeline.mockResolvedValue([
      { category: "HOT_FLASH", occurredAt: new Date("2026-06-01T08:00:00.000Z") },
      { category: "HOT_FLASH", occurredAt: new Date("2026-06-15T08:00:00.000Z") },
    ]);

    const events = await timelineService.get("user-1", {});

    expect(events.filter((e) => e.type === "SYMPTOM_WEEK")).toHaveLength(2);
  });

  it("produces TREATMENT_STARTED and TREATMENT_ENDED events for a completed treatment", async () => {
    mockedRepo.listTreatmentsOverlappingRange.mockResolvedValue([
      {
        id: "t1",
        userId: "user-1",
        name: "Vitamin D",
        category: "SUPPLEMENT",
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-06-20"),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);

    const events = await timelineService.get("user-1", {});

    expect(events).toEqual([
      {
        type: "TREATMENT_STARTED",
        date: "2026-06-01",
        treatmentId: "t1",
        name: "Vitamin D",
        category: "SUPPLEMENT",
      },
      {
        type: "TREATMENT_ENDED",
        date: "2026-06-20",
        treatmentId: "t1",
        name: "Vitamin D",
        category: "SUPPLEMENT",
      },
    ]);
  });

  it("omits TREATMENT_STARTED for a treatment that started before the requested range", async () => {
    mockedRepo.listTreatmentsOverlappingRange.mockResolvedValue([
      {
        id: "t1",
        userId: "user-1",
        name: "HRT",
        category: "HRT",
        startDate: new Date("2026-01-01"),
        endDate: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);

    const events = await timelineService.get("user-1", { from: new Date("2026-06-01") } as never);

    // Ongoing, started before the window: no started/ended event should appear.
    expect(events).toEqual([]);
  });

  it("produces a BRIEF_GENERATED event from a brief's createdAt", async () => {
    mockedRepo.listBriefsGeneratedInRange.mockResolvedValue([
      {
        id: "b1",
        fromDate: new Date("2026-05-01"),
        toDate: new Date("2026-06-01"),
        createdAt: new Date("2026-06-02T10:00:00.000Z"),
      } as never,
    ]);

    const events = await timelineService.get("user-1", {});

    expect(events).toEqual([
      {
        type: "BRIEF_GENERATED",
        date: "2026-06-02",
        briefId: "b1",
        fromDate: "2026-05-01",
        toDate: "2026-06-01",
      },
    ]);
  });

  it("sorts all event types together chronologically, and by a fixed type order on the same date", async () => {
    mockedRepo.symptomLogsForTimeline.mockResolvedValue([
      { category: "HOT_FLASH", occurredAt: new Date("2026-06-15T08:00:00.000Z") },
    ]);
    mockedRepo.listTreatmentsOverlappingRange.mockResolvedValue([
      {
        id: "t1",
        userId: "user-1",
        name: "Vitamin D",
        category: "SUPPLEMENT",
        startDate: new Date("2026-06-15"),
        endDate: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);
    mockedRepo.listBriefsGeneratedInRange.mockResolvedValue([
      {
        id: "b1",
        fromDate: new Date("2026-05-01"),
        toDate: new Date("2026-06-01"),
        createdAt: new Date("2026-06-15T10:00:00.000Z"),
      } as never,
    ]);

    const events = await timelineService.get("user-1", {});

    // Same date (2026-06-15/2026-06-15 week): SYMPTOM_WEEK, then
    // TREATMENT_STARTED, then BRIEF_GENERATED, per TYPE_ORDER.
    expect(events.map((e) => e.type)).toEqual([
      "SYMPTOM_WEEK",
      "TREATMENT_STARTED",
      "BRIEF_GENERATED",
    ]);
  });
});
