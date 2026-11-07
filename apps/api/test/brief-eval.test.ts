import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVAL_RECORDS } from "../eval/brief/records.js";
import { prepareRecord } from "../eval/brief/pipeline.js";
import { languageMatches } from "../eval/brief/checks.js";
import { renderMarkdown, runReplay } from "../eval/brief/run.js";

// The offline BRIEF evaluation harness, run in CI: the checks must catch
// every adversarial synthetic response and pass every faithful one, and
// the committed report must match a fresh run byte for byte.
describe("BRIEF evaluation harness (offline replay)", () => {
  const results = runReplay();

  it("has 15 fictional records covering every required scenario and language", () => {
    expect(EVAL_RECORDS).toHaveLength(15);
    expect(new Set(EVAL_RECORDS.map((r) => r.id)).size).toBe(15);
    const coverage = new Set(EVAL_RECORDS.flatMap((r) => r.coverage));
    for (const c of ["sparse", "complete", "contradictory", "missing", "edge", "insufficient"]) {
      expect(coverage).toContain(c);
    }
    expect(new Set(EVAL_RECORDS.map((r) => r.locale))).toEqual(new Set(["en", "fr", "ja"]));
  });

  it("builds the AI input with production's deterministic pipeline, never treatment names", () => {
    for (const record of EVAL_RECORDS) {
      const { aiInput } = prepareRecord(record);
      expect(JSON.stringify(aiInput)).not.toContain("Fictional treatment");
    }
    // At the co-occurrence threshold a pattern exists; one day below it, none does.
    const at = prepareRecord(EVAL_RECORDS.find((r) => r.id.includes("at-threshold"))!);
    const below = prepareRecord(EVAL_RECORDS.find((r) => r.id.includes("below-threshold"))!);
    expect(at.interpretation.patterns.some((p) => p.type === "co_occurrence_detected")).toBe(true);
    expect(below.interpretation.patterns.some((p) => p.type === "co_occurrence_detected")).toBe(
      false,
    );
  });

  it("catches every adversarial case and passes every faithful one", () => {
    const unexpected = results.filter((r) => !r.asExpected);
    expect(unexpected.map((r) => `${r.recordId}/${r.variant}`)).toEqual([]);
    expect(results).toHaveLength(15 * 6);
  });

  it("reproduces the committed report exactly", () => {
    const committed = readFileSync(join(__dirname, "../eval/brief/reports/replay.md"), "utf8");
    expect(renderMarkdown(results, "replay")).toBe(committed);
  });

  it("tells the three languages apart", () => {
    expect(languageMatches("Hot flushes were recorded on three days.", "en")).toBe(true);
    expect(languageMatches("Les bouffées de chaleur ont été notées sur trois jours.", "fr")).toBe(
      true,
    );
    expect(languageMatches("ほてりが3日記録されました。", "ja")).toBe(true);
    expect(languageMatches("ほてりが3日記録されました。", "en")).toBe(false);
    expect(languageMatches("Hot flushes were recorded on three days.", "ja")).toBe(false);
  });
});
