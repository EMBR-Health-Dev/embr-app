import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  boundedArray,
  patchOnboardingSchema,
  perimenopauseAssessmentSchema,
  saveSymptomCheckInSchema,
} from "@embr/validation";

// GHSA-mrhx-c7xc-m3w5: zod 3 parses every element of an array even
// after .max() has failed, keeping one issue per bad element. A 1 MB
// request body (express.json's limit) of junk elements is ~500,000
// elements; these tests pin that an oversized array is rejected with a
// single issue, before any element is looked at.
const JUNK = Array<number>(500_000).fill(1);

describe("boundedArray", () => {
  it("accepts a valid array within the bound", () => {
    expect(boundedArray(z.enum(["A", "B"]), 3).parse(["A", "B"])).toEqual(["A", "B"]);
  });

  it("still validates each element when within the bound", () => {
    expect(boundedArray(z.enum(["A", "B"]), 3).safeParse(["C"]).success).toBe(false);
  });

  it("rejects a non array", () => {
    expect(boundedArray(z.enum(["A"]), 3).safeParse("A").success).toBe(false);
  });

  it("rejects an oversized array with one issue, without parsing its elements", () => {
    const result = boundedArray(z.enum(["A", "B"]), 20).safeParse(JUNK);
    expect(result.success).toBe(false);
    expect(result.error!.issues).toHaveLength(1);
  });
});

describe("request schemas reject oversized arrays cheaply", () => {
  it.each([
    [
      "public assessment symptoms",
      perimenopauseAssessmentSchema,
      { symptoms: JUNK, hasIrregularPeriods: false },
    ],
    ["onboarding noticedAreas", patchOnboardingSchema, { noticedAreas: JUNK }],
    ["check in entries", saveSymptomCheckInSchema, { timeZone: "UTC", entries: JUNK }],
  ])("%s", (_name, schema, body) => {
    const started = Date.now();
    const result = (schema as z.ZodTypeAny).safeParse(body);
    expect(result.success).toBe(false);
    expect(result.error!.issues).toHaveLength(1);
    // Unguarded, this took ~600 ms and ~160 MB of heap.
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("still enforces each schema's own rules within the bound", () => {
    expect(
      saveSymptomCheckInSchema.safeParse({
        timeZone: "UTC",
        entries: [
          { category: "HOT_FLASH", severity: "MILD" },
          { category: "HOT_FLASH", severity: "SEVERE" },
        ],
      }).success,
    ).toBe(false);
    expect(
      perimenopauseAssessmentSchema.safeParse({
        symptoms: ["HOT_FLASH"],
        hasIrregularPeriods: true,
      }).success,
    ).toBe(true);
  });
});
