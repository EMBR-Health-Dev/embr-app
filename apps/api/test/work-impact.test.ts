import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORK_IMPACT_BREAKDOWN_MIN_DAYS,
  summarizeWorkImpact,
} from "../src/modules/briefs/work-impact.js";

describe("summarizeWorkImpact", () => {
  it("reports zero answered days for no answers", () => {
    expect(summarizeWorkImpact([])).toEqual({ daysAnswered: 0, breakdown: null });
  });

  it("never counts a blank day as no effect", () => {
    expect(summarizeWorkImpact([null, null, "NONE"])).toEqual({ daysAnswered: 1, breakdown: null });
  });

  it("holds back the breakdown below the minimum", () => {
    const six = Array(WORK_IMPACT_BREAKDOWN_MIN_DAYS - 1).fill("DID_LESS");
    expect(summarizeWorkImpact(six).breakdown).toBeNull();
  });

  it("gives every answer, including zeros, at the minimum", () => {
    const seven = Array(WORK_IMPACT_BREAKDOWN_MIN_DAYS).fill("MISSED_TIME");
    expect(summarizeWorkImpact(seven)).toEqual({
      daysAnswered: 7,
      breakdown: { NONE: 0, DID_LESS: 0, MISSED_TIME: 7 },
    });
  });
});

// An employer must never see anything about work impact, not even as a
// suppressed count. Organisation statistics are built only from the
// organisations and admin modules; neither may read context logs.
describe("work impact never reaches organisation statistics", () => {
  const modulesDir = join(import.meta.dirname, "../src/modules");
  for (const mod of ["organizations", "admin"]) {
    it(`the ${mod} module never reads context logs or work impact`, () => {
      const dir = join(modulesDir, mod);
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
        const source = readFileSync(join(dir, file), "utf8");
        expect(source, `${mod}/${file}`).not.toMatch(/contextLog|workImpact|WorkImpact/);
      }
    });
  }
});
