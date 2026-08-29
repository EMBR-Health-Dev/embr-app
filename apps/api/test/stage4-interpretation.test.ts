import { describe, expect, it } from "vitest";
import {
  buildStage4Interpretation,
  INTERPRETATION_VERSION,
  type Stage4Input,
} from "../src/modules/briefs/stage4-interpretation.js";
import { compareSymptomFrequency } from "../src/modules/briefs/period-comparison.js";
import { detectPersistentSymptoms } from "../src/modules/briefs/persistent-symptoms.js";

function emptyInput(overrides: Partial<Stage4Input> = {}): Stage4Input {
  return { frequencyComparison: [], coOccurrence: null, treatmentImpact: [], ...overrides };
}

function treatmentImpact(overrides: Partial<Stage4Input["treatmentImpact"][number]> = {}) {
  return {
    treatmentId: "t1",
    name: "Estradiol patch",
    category: "HRT" as const,
    windowDays: 14,
    before: { logCount: 2, days: 14 },
    after: { logCount: 5, days: 14 },
    insufficientData: false,
    ...overrides,
  };
}

describe("buildStage4Interpretation — frequency patterns", () => {
  it("produces frequency_increased for an increased entry, with the correct evidenceRef", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toMatchObject({
      type: "frequency_increased",
      confidence: "descriptive",
      evidenceRef: { category: "HOT_FLASH" },
    });
    expect(result.patterns[0]!.observation).toContain("6");
    expect(result.patterns[0]!.observation).toContain("4");
  });

  it("produces frequency_decreased for a decreased entry, with the correct evidenceRef", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 2 }],
      [{ category: "HOT_FLASH", count: 6 }],
    );
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toMatchObject({
      type: "frequency_decreased",
      evidenceRef: { category: "HOT_FLASH" },
    });
  });

  it("produces no pattern for an unchanged entry", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 5 }],
      [{ category: "HOT_FLASH", count: 5 }],
    );
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));

    expect(result.patterns).toEqual([]);
  });

  it("does not apply a materiality floor — a change of 1 still produces a pattern", () => {
    // Explicit regression guard for the approved design decision: no
    // second, independent "is this big enough" threshold on top of
    // period-comparison.ts's own qualified result.
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 2 }],
      [{ category: "HOT_FLASH", count: 1 }],
    );
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]!.type).toBe("frequency_increased");
  });

  it("both directions can coexist across categories in one result", () => {
    const comparison = compareSymptomFrequency(
      [
        { category: "HOT_FLASH", count: 6 },
        { category: "FATIGUE", count: 1 },
      ],
      [
        { category: "HOT_FLASH", count: 4 },
        { category: "FATIGUE", count: 5 },
      ],
    );
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));

    expect(result.patterns).toHaveLength(2);
    expect(result.patterns.map((p) => p.type).sort()).toEqual([
      "frequency_decreased",
      "frequency_increased",
    ]);
  });
});

describe("buildStage4Interpretation — co-occurrence pattern", () => {
  it("produces co_occurrence_detected when a pair is supplied, with association and evidenceRef", () => {
    const result = buildStage4Interpretation(
      emptyInput({ coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 } }),
    );

    expect(result.patterns).toHaveLength(1);
    const pattern = result.patterns[0]!;
    expect(pattern.type).toBe("co_occurrence_detected");
    expect(pattern.evidenceRef).toEqual({ categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH" });
    expect(pattern.association).toBeDefined();
    expect(pattern.association).toContain("4");
  });

  it("produces no co-occurrence pattern when coOccurrence is null", () => {
    const result = buildStage4Interpretation(emptyInput({ coOccurrence: null }));
    expect(result.patterns.some((p) => p.type === "co_occurrence_detected")).toBe(false);
  });

  it("only frequency/treatment patterns carry association: undefined — it is exclusive to co-occurrence", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    const result = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: comparison,
        treatmentImpact: [treatmentImpact()],
      }),
    );
    for (const pattern of result.patterns) {
      expect(pattern.association).toBeUndefined();
    }
  });
});

describe("buildStage4Interpretation — treatment window pattern", () => {
  it("produces treatment_window_changed when insufficientData is false, with the correct evidenceRef", () => {
    const result = buildStage4Interpretation(
      emptyInput({ treatmentImpact: [treatmentImpact({ insufficientData: false })] }),
    );

    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toMatchObject({
      type: "treatment_window_changed",
      evidenceRef: { treatmentId: "t1" },
    });
  });

  it("produces no pattern when insufficientData is true", () => {
    const result = buildStage4Interpretation(
      emptyInput({ treatmentImpact: [treatmentImpact({ insufficientData: true })] }),
    );

    expect(result.patterns).toEqual([]);
  });

  it("evaluates multiple treatments independently", () => {
    const result = buildStage4Interpretation(
      emptyInput({
        treatmentImpact: [
          treatmentImpact({ treatmentId: "t1", insufficientData: false }),
          treatmentImpact({ treatmentId: "t2", insufficientData: true }),
          treatmentImpact({ treatmentId: "t3", insufficientData: false }),
        ],
      }),
    );

    expect(
      result.patterns.map((p) => (p.evidenceRef as { treatmentId: string }).treatmentId),
    ).toEqual(["t1", "t3"]);
  });
});

describe("buildStage4Interpretation — evidence not mapped to any approved pattern type", () => {
  it("persistent symptoms produce no Stage 4 pattern — Stage4Input has no field for them at all", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 5 }],
      [{ category: "HOT_FLASH", count: 3 }],
    );
    const persistent = detectPersistentSymptoms(comparison);
    expect(persistent).toEqual(["HOT_FLASH"]); // sanity: it does qualify as persistent

    // Stage4Input's type has no persistentSymptoms field to pass this
    // into — this is a structural guarantee, not just a runtime check.
    // The only pattern this frequencyComparison entry can produce is
    // frequency_increased, never anything persistence-related.
    const result = buildStage4Interpretation(emptyInput({ frequencyComparison: comparison }));
    expect(result.patterns.map((p) => p.type)).toEqual(["frequency_increased"]);
  });
});

describe("buildStage4Interpretation — contract", () => {
  it("includes interpretationVersion on the result", () => {
    const result = buildStage4Interpretation(emptyInput());
    expect(result.interpretationVersion).toBe(INTERPRETATION_VERSION);
    expect(result.interpretationVersion).toBe("1.0");
  });

  it("empty qualified input produces patterns: [], not null or undefined", () => {
    const result = buildStage4Interpretation(emptyInput());
    expect(result.patterns).toEqual([]);
  });

  it("every pattern has confidence: 'descriptive'", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    const result = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: comparison,
        coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
        treatmentImpact: [treatmentImpact()],
      }),
    );
    expect(result.patterns.length).toBeGreaterThan(0);
    for (const pattern of result.patterns) {
      expect(pattern.confidence).toBe("descriptive");
    }
  });

  it("is deterministic — the same input always produces the same output", () => {
    const input = emptyInput({
      frequencyComparison: compareSymptomFrequency(
        [
          { category: "HOT_FLASH", count: 6 },
          { category: "FATIGUE", count: 1 },
        ],
        [
          { category: "HOT_FLASH", count: 4 },
          { category: "FATIGUE", count: 5 },
        ],
      ),
      coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
      treatmentImpact: [treatmentImpact()],
    });

    expect(buildStage4Interpretation(input)).toEqual(buildStage4Interpretation(input));
  });

  it("interpretation and caveat text never assert causality — exact contract per pattern type", () => {
    // These are fixed template constants, not AI output, so exact
    // string assertions are the right test here — a fragile causal-
    // language regex would be exactly the kind of brittle heuristic
    // this milestone is explicitly cautious about, and is unnecessary
    // for text this module fully controls itself.
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    const result = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: comparison,
        coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
        treatmentImpact: [treatmentImpact()],
      }),
    );

    const byType = Object.fromEntries(result.patterns.map((p) => [p.type, p]));
    expect(byType.frequency_increased!.interpretation).toBe(
      "This represents an increase in how often HOT_FLASH was reported, relative to the previous period.",
    );
    expect(byType.co_occurrence_detected!.interpretation).toBe(
      "This indicates the two symptoms tend to occur on the same days. It does not establish that one causes the other.",
    );
    expect(byType.co_occurrence_detected!.caveat).toBe(
      "This is a temporal association only, not a causal relationship.",
    );
    expect(byType.treatment_window_changed!.interpretation).toBe(
      "This reflects the number of symptom logs recorded before and after this treatment began. It does not establish whether the treatment caused any change.",
    );
    expect(byType.treatment_window_changed!.caveat).toBe(
      "This is an observed change over time, not evidence that the treatment caused it.",
    );
  });
});

describe("buildStage4Interpretation — deterministic pattern IDs", () => {
  it("assigns a deterministic id to every pattern, built from type and evidence — not a random UUID", () => {
    const comparison = compareSymptomFrequency(
      [{ category: "HOT_FLASH", count: 6 }],
      [{ category: "HOT_FLASH", count: 4 }],
    );
    const result = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: comparison,
        coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
        treatmentImpact: [treatmentImpact({ treatmentId: "treatment-abc" })],
      }),
    );

    const byType = Object.fromEntries(result.patterns.map((p) => [p.type, p]));
    expect(byType.frequency_increased!.id).toBe("frequency_increased:HOT_FLASH");
    expect(byType.co_occurrence_detected!.id).toBe("co_occurrence_detected:BRAIN_FOG:HOT_FLASH");
    expect(byType.treatment_window_changed!.id).toBe("treatment_window_changed:treatment-abc");
  });

  it("produces identical ids for identical input, computed independently", () => {
    const input = emptyInput({
      frequencyComparison: compareSymptomFrequency(
        [{ category: "HOT_FLASH", count: 6 }],
        [{ category: "HOT_FLASH", count: 4 }],
      ),
      coOccurrence: { categoryA: "BRAIN_FOG", categoryB: "HOT_FLASH", days: 4 },
      treatmentImpact: [treatmentImpact()],
    });

    const first = buildStage4Interpretation(input).patterns.map((p) => p.id);
    const second = buildStage4Interpretation(input).patterns.map((p) => p.id);

    expect(first).toEqual(second);
  });

  it("assigns distinct ids to different patterns, including two frequency patterns for different categories", () => {
    const comparison = compareSymptomFrequency(
      [
        { category: "HOT_FLASH", count: 6 },
        { category: "FATIGUE", count: 1 },
      ],
      [
        { category: "HOT_FLASH", count: 4 },
        { category: "FATIGUE", count: 5 },
      ],
    );
    const result = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: comparison,
        treatmentImpact: [
          treatmentImpact({ treatmentId: "t1" }),
          treatmentImpact({ treatmentId: "t2" }),
        ],
      }),
    );

    const ids = result.patterns.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // every id is unique
  });

  it("changes the id when the underlying evidence category changes, even for the same pattern type", () => {
    const hotFlash = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: compareSymptomFrequency(
          [{ category: "HOT_FLASH", count: 6 }],
          [{ category: "HOT_FLASH", count: 4 }],
        ),
      }),
    ).patterns[0]!;
    const fatigue = buildStage4Interpretation(
      emptyInput({
        frequencyComparison: compareSymptomFrequency(
          [{ category: "FATIGUE", count: 6 }],
          [{ category: "FATIGUE", count: 4 }],
        ),
      }),
    ).patterns[0]!;

    expect(hotFlash.id).not.toBe(fatigue.id);
  });
});
