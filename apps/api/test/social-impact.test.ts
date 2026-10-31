import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SOCIAL_IMPACT_BREAKDOWN_MIN_DAYS,
  summarizeSocialImpact,
} from "../src/modules/briefs/social-impact.js";

describe("summarizeSocialImpact", () => {
  it("reports zero answered days for no answers", () => {
    expect(summarizeSocialImpact([])).toEqual({ daysAnswered: 0, breakdown: null });
  });

  it("never counts a blank day as no effect", () => {
    expect(summarizeSocialImpact([null, null, "NONE"])).toEqual({
      daysAnswered: 1,
      breakdown: null,
    });
  });

  it("holds back the breakdown below the minimum", () => {
    const six = Array(SOCIAL_IMPACT_BREAKDOWN_MIN_DAYS - 1).fill("DID_LESS");
    expect(summarizeSocialImpact(six).breakdown).toBeNull();
  });

  it("gives every answer, including zeros, at the minimum", () => {
    const seven = Array(SOCIAL_IMPACT_BREAKDOWN_MIN_DAYS).fill("MISSED_PLANS");
    expect(summarizeSocialImpact(seven)).toEqual({
      daysAnswered: 7,
      breakdown: { NONE: 0, DID_LESS: 0, MISSED_PLANS: 7 },
    });
  });
});

// Like work impact: an employer must never see anything about her family
// and social life, not even as a suppressed count.
describe("social impact never reaches organisation statistics", () => {
  const modulesDir = join(import.meta.dirname, "../src/modules");
  for (const mod of ["organizations", "admin"]) {
    it(`the ${mod} module never reads social impact`, () => {
      const dir = join(modulesDir, mod);
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
        const source = readFileSync(join(dir, file), "utf8");
        expect(source, `${mod}/${file}`).not.toMatch(/socialImpact|SocialImpact/);
      }
    });
  }
});
