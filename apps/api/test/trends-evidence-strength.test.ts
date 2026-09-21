import { describe, expect, it } from "vitest";
import {
  computeEvidenceStrength,
  EARLY_TO_EMERGING_DAYS,
  EMERGING_TO_ESTABLISHED_DAYS,
} from "../src/modules/trends/evidence-strength.js";

describe("computeEvidenceStrength", () => {
  it("is EARLY with no days logged", () => {
    expect(computeEvidenceStrength(0)).toBe("EARLY");
  });

  it("is EARLY one day below the EMERGING threshold", () => {
    expect(computeEvidenceStrength(EARLY_TO_EMERGING_DAYS - 1)).toBe("EARLY");
  });

  it("is EMERGING at exactly the EMERGING threshold", () => {
    expect(computeEvidenceStrength(EARLY_TO_EMERGING_DAYS)).toBe("EMERGING");
    expect(computeEvidenceStrength(14)).toBe("EMERGING");
  });

  it("is EMERGING one day below the ESTABLISHED threshold", () => {
    expect(computeEvidenceStrength(EMERGING_TO_ESTABLISHED_DAYS - 1)).toBe("EMERGING");
  });

  it("is ESTABLISHED at exactly the ESTABLISHED threshold", () => {
    expect(computeEvidenceStrength(EMERGING_TO_ESTABLISHED_DAYS)).toBe("ESTABLISHED");
    expect(computeEvidenceStrength(45)).toBe("ESTABLISHED");
  });

  it("stays ESTABLISHED well beyond the threshold", () => {
    expect(computeEvidenceStrength(400)).toBe("ESTABLISHED");
  });
});
