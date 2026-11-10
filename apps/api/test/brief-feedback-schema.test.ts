import { describe, expect, it } from "vitest";
import { BRIEF_FEEDBACK_COMMENT_MAX, briefFeedbackSchema } from "@embr/validation";

describe("briefFeedbackSchema", () => {
  it("accepts each of the five answers, with or without a comment", () => {
    for (const answer of [
      "YES_SIGNIFICANTLY",
      "YES_SOMEWHAT",
      "NOT_REALLY",
      "NO",
      "NO_APPOINTMENT_YET",
    ]) {
      expect(briefFeedbackSchema.parse({ answer })).toEqual({ answer, comment: null });
    }
    expect(briefFeedbackSchema.parse({ answer: "NO", comment: "  short  " })).toEqual({
      answer: "NO",
      comment: "short",
    });
  });

  it("stores a blank comment as no comment", () => {
    expect(briefFeedbackSchema.parse({ answer: "NO", comment: "   " }).comment).toBeNull();
  });

  it("rejects an unknown answer and an over-long comment", () => {
    expect(briefFeedbackSchema.safeParse({ answer: "MAYBE" }).success).toBe(false);
    expect(
      briefFeedbackSchema.safeParse({
        answer: "NO",
        comment: "x".repeat(BRIEF_FEEDBACK_COMMENT_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it("ignores any field beyond the answer and comment", () => {
    const parsed = briefFeedbackSchema.parse({ answer: "NO", diagnosis: "x", userId: "u" });
    expect(Object.keys(parsed).sort()).toEqual(["answer", "comment"]);
  });
});
