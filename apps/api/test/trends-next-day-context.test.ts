import { describe, expect, it } from "vitest";
import type { SymptomCategory } from "@embr/types";
import type { ContextLogRow } from "../src/modules/trends/context-co-occurrence.js";
import { MAX_RESULTS, detectNextDayContext } from "../src/modules/trends/next-day-context.js";

function day(n: number) {
  const d = new Date("2026-10-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ctx(n: number, fields: Partial<ContextLogRow> = {}): ContextLogRow {
  return {
    date: new Date(`${day(n)}T00:00:00Z`),
    sleepDuration: null,
    caffeineAfternoon: null,
    alcohol: null,
    stressLevel: null,
    exercise: null,
    ...fields,
  };
}
function sym(category: SymptomCategory, n: number) {
  return { category, occurredAt: new Date(`${day(n)}T09:00:00Z`) };
}

/**
 * Short sleep on days 0, 2, 4, 6; enough sleep on days 10..15.
 * Brain fog on 1, 3, 5 (after short sleep) and on 11 (after enough sleep).
 * Every next day has an entry: either brain fog or a context answer.
 */
function scenario() {
  const contextLogs = [
    ...[0, 2, 4, 6].map((n) => ctx(n, { sleepDuration: "UNDER_6H" })),
    ...[10, 11, 12, 13, 14, 15].map((n) => ctx(n, { sleepDuration: "SEVEN_PLUS_H" })),
  ];
  const symptomLogs = [
    sym("BRAIN_FOG", 1),
    sym("BRAIN_FOG", 3),
    sym("BRAIN_FOG", 5),
    sym("BRAIN_FOG", 11),
  ];
  // Day 7 (after short sleep on 6) has a different symptom, so it counts as a day with an entry.
  symptomLogs.push(sym("HOT_FLASH", 7));
  // Day 16 needs an entry for day 15 to count.
  symptomLogs.push(sym("HOT_FLASH", 16));
  return { contextLogs, symptomLogs };
}

describe("detectNextDayContext", () => {
  it("counts the day after a factor next to the day after other answered days", () => {
    const { contextLogs, symptomLogs } = scenario();
    expect(detectNextDayContext(symptomLogs, contextLogs)).toEqual([
      {
        factor: "SHORT_SLEEP",
        category: "BRAIN_FOG",
        afterFactorDays: 3,
        afterFactorTotal: 4,
        otherDays: 1,
        otherTotal: 6,
      },
    ]);
  });

  it("leaves out next days with no entry at all", () => {
    const { contextLogs, symptomLogs } = scenario();
    // Without the hot flash on day 7, short sleep on day 6 has an empty day after.
    const withoutDay7 = symptomLogs.filter(
      (l) => !(l.category === "HOT_FLASH" && l.occurredAt.toISOString().startsWith(day(7))),
    );
    expect(detectNextDayContext(withoutDay7, contextLogs)[0]).toMatchObject({
      afterFactorDays: 3,
      afterFactorTotal: 3,
    });
  });

  it("does not treat an unanswered question as a day without the factor", () => {
    const { contextLogs, symptomLogs } = scenario();
    // Days 10..15 answered only stress, not sleep: no comparison days, so nothing to show.
    const noSleepAnswers = contextLogs.map((l) =>
      l.sleepDuration === "UNDER_6H" ? l : { ...l, sleepDuration: null, stressLevel: "LOW" },
    );
    expect(detectNextDayContext(symptomLogs, noSleepAnswers)).toEqual([]);
  });

  it("needs at least three days after the factor", () => {
    const { contextLogs, symptomLogs } = scenario();
    const twoOnly = symptomLogs.filter(
      (l) => !(l.category === "BRAIN_FOG" && l.occurredAt.toISOString().startsWith(day(5))),
    );
    expect(detectNextDayContext(twoOnly, contextLogs)).toEqual([]);
  });

  it("shows nothing when the symptom is no more common after the factor", () => {
    const { contextLogs, symptomLogs } = scenario();
    // Brain fog after every enough-sleep day too: 3/4 vs 6/6.
    const everywhere = [
      ...symptomLogs,
      ...[11, 12, 13, 14, 15, 16].map((n) => sym("BRAIN_FOG", n)),
    ];
    expect(detectNextDayContext(everywhere, contextLogs)).toEqual([]);
  });

  it("uses the same factor rule as the same-day card", () => {
    const { symptomLogs } = scenario();
    // "SEVEN_PLUS_H" is not short sleep; only UNDER_6H is.
    const contextLogs = [0, 2, 4, 6, 10, 11, 12, 13, 14, 15].map((n) =>
      ctx(n, { sleepDuration: "SEVEN_PLUS_H" }),
    );
    expect(detectNextDayContext(symptomLogs, contextLogs)).toEqual([]);
  });

  it("is the same whatever order rows come in, and returns at most MAX_RESULTS", () => {
    const { contextLogs, symptomLogs } = scenario();
    const a = detectNextDayContext(symptomLogs, contextLogs);
    const b = detectNextDayContext([...symptomLogs].reverse(), [...contextLogs].reverse());
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(MAX_RESULTS);
  });
});
