import { describe, expect, it } from "vitest";
import { showsFirstBriefNudge, startSteps } from "./getting-started";

const now = new Date("2026-10-16T12:00:00Z");
const base = {
  accountCreatedAt: "2026-10-15T09:00:00Z",
  recordStart: null,
  symptomCount: 0,
  hasLifeStage: false,
  hasBrief: false,
  now,
};

describe("getting started", () => {
  it("lists four steps, none done, for a brand new account", () => {
    const steps = startSteps(base);
    expect(steps?.map((s) => s.key)).toEqual(["logToday", "lifeStage", "aWeek", "firstBrief"]);
    expect(steps?.every((s) => !s.done)).toBe(true);
  });

  it("ticks steps off from what is already in the record", () => {
    const steps = startSteps({ ...base, symptomCount: 3, hasLifeStage: true });
    expect(steps?.filter((s) => s.done).map((s) => s.key)).toEqual(["logToday", "lifeStage"]);
  });

  it("disappears after the first two weeks", () => {
    expect(startSteps({ ...base, accountCreatedAt: "2026-10-01T09:00:00Z" })).toBeNull();
  });

  it("disappears once every step is done", () => {
    expect(
      startSteps({
        ...base,
        symptomCount: 9,
        hasLifeStage: true,
        recordStart: "2026-10-09",
        hasBrief: true,
      }),
    ).toBeNull();
  });

  it("nudges for a first BRIEF only after a week of records and before any BRIEF", () => {
    expect(showsFirstBriefNudge({ ...base, recordStart: "2026-10-13" })).toBe(false);
    expect(showsFirstBriefNudge({ ...base, recordStart: "2026-10-10" })).toBe(true);
    expect(showsFirstBriefNudge({ ...base, recordStart: "2026-10-10", hasBrief: true })).toBe(
      false,
    );
  });
});
