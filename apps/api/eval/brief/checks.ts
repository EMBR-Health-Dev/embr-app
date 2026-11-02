/**
 * The checks every evaluated response goes through. The first three
 * are production's own code paths (parseBriefResponse runs the shape,
 * discussion topic citation and content safety checks;
 * validateStage4Patterns runs citation integrity against the canonical
 * interpretation). The rest are evaluation-only heuristics: they flag
 * responses for review and never run in production.
 */
import {
  briefAiFailureReason,
  parseBriefResponse,
  type BriefContent,
} from "../../src/modules/briefs/brief.ai.js";
import { validateStage4Patterns } from "../../src/modules/briefs/stage4-validation.js";
import type { Locale } from "../../src/lib/locale.js";
import type { PreparedRecord } from "./pipeline.js";

/** Evaluation thresholds. Product heuristics for review, not clinical rules. */
export const EVAL_LIMITS = {
  /** Per language: Japanese carries about twice the meaning per character. */
  narrativeMaxChars: { en: 1600, fr: 1700, ja: 800 } as Record<Locale, number>,
  topicMaxChars: { en: 260, fr: 280, ja: 130 } as Record<Locale, number>,
  latencyBudgetMs: 20_000,
};

export type CheckName =
  "schema" | "prohibited_language" | "citation_integrity" | "truncation" | "language" | "length";

export interface CheckResult {
  name: CheckName;
  passed: boolean;
  /** A reason code or short description: never the response text. */
  detail: string | null;
}

export interface ModelOutput {
  text: string;
  stopReason: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

const CJK = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g;
const LETTERS = /[\p{L}]/gu;
const EN_WORDS = /\b(the|and|was|were|you|your|with|during|this|of|to|is)\b/gi;
const FR_WORDS = /\b(le|la|les|des|du|vous|votre|est|une|pendant|avec|et|sur)\b/gi;

/** Whether text reads as the requested language. A heuristic: script for
 * Japanese, common function words for English versus French. */
export function languageMatches(text: string, locale: Locale): boolean {
  const letters = (text.match(LETTERS) ?? []).length;
  if (letters === 0) return true;
  const cjk = (text.match(CJK) ?? []).length;
  if (locale === "ja") return cjk / letters >= 0.5;
  if (cjk > 0) return false;
  const en = (text.match(EN_WORDS) ?? []).length;
  const fr = (text.match(FR_WORDS) ?? []).length;
  return locale === "fr" ? fr >= en : en >= fr;
}

/** Runs every check. Production checks stop at the first failure, as
 * production does; the evaluation-only checks then run on whatever
 * content parsed. */
export function evaluateOutput(prepared: PreparedRecord, output: ModelOutput): CheckResult[] {
  const { locale } = prepared.record;
  const results: CheckResult[] = [];
  const truncated = output.stopReason === "max_tokens";
  results.push({ name: "truncation", passed: !truncated, detail: truncated ? "max_tokens" : null });

  let content: BriefContent | null = null;
  try {
    content = parseBriefResponse(output.text, locale, { stopReason: output.stopReason });
    results.push({ name: "schema", passed: true, detail: null });
    results.push({ name: "prohibited_language", passed: true, detail: null });
  } catch (err) {
    const reason = briefAiFailureReason(err);
    const schemaReasons = ["invalid_json", "invalid_shape", "truncated", "no_text"];
    results.push({
      name: "schema",
      passed: !schemaReasons.includes(reason),
      detail: schemaReasons.includes(reason) ? reason : null,
    });
    results.push({
      name: "prohibited_language",
      passed: reason !== "content_safety",
      detail: reason === "content_safety" ? "content_safety" : null,
    });
    if (reason === "citation") {
      results.push({ name: "citation_integrity", passed: false, detail: "topic_citation" });
    }
  }

  if (content) {
    const validation = validateStage4Patterns(prepared.interpretation.patterns, content.patterns);
    results.push({
      name: "citation_integrity",
      passed: validation.error === null,
      detail: validation.error === null ? null : "pattern_not_supplied_or_altered",
    });

    const pieces = [content.narrative, ...content.discussionTopics];
    const wrongLanguage = pieces.filter((p) => !languageMatches(p, locale)).length;
    results.push({
      name: "language",
      passed: wrongLanguage === 0,
      detail: wrongLanguage === 0 ? null : `${wrongLanguage} piece(s) not in ${locale}`,
    });

    const longTopics = content.discussionTopics.filter(
      (t) => t.length > EVAL_LIMITS.topicMaxChars[locale],
    ).length;
    const longNarrative = content.narrative.length > EVAL_LIMITS.narrativeMaxChars[locale];
    results.push({
      name: "length",
      passed: !longNarrative && longTopics === 0,
      detail:
        longNarrative || longTopics > 0
          ? `narrative ${content.narrative.length} chars, ${longTopics} long topic(s)`
          : null,
    });
  } else if (!results.some((r) => r.name === "citation_integrity")) {
    results.push({ name: "citation_integrity", passed: true, detail: "not reached" });
  }

  return results;
}
